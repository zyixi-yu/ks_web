import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { loadRecentHandles, saveRecentHandle, type RecentHandle } from "../lib/recentHandles";
import { formatTimeBeijingYYYYMMDDHHmm } from "../lib/time";

type PlayerRole = {
  role_id: number;
  role_name: string;
  team_name: "幸存者" | "凯瑞甘";
  core_mmr: number;
  class_mmr: number;
  mmr: number;
  wins: number;
  plays: number;
  win_rate: number | null;
};

type PlayerApiResponse = {
  generated_at: string;
  player_handle: string;
  cores: { survivor: number; kerrigan: number };
  roles_survivor: PlayerRole[];
  roles_kerrigan: PlayerRole[];
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function parsePlayerApiResponse(x: unknown): PlayerApiResponse | null {
  if (!isRecord(x)) return null;
  if (typeof x.generated_at !== "string") return null;
  if (typeof x.player_handle !== "string") return null;
  if (!isRecord(x.cores)) return null;
  if (typeof x.cores.survivor !== "number") return null;
  if (typeof x.cores.kerrigan !== "number") return null;
  if (!Array.isArray(x.roles_survivor) || !Array.isArray(x.roles_kerrigan)) return null;
  return x as PlayerApiResponse;
}

function fmtSigned(n: number): string {
  if (!Number.isFinite(n)) return "--";
  if (n > 0) return `+${n}`;
  return String(n);
}

function pct(x: number | null): string {
  if (x == null || !Number.isFinite(x)) return "--";
  return `${Math.round(x * 1000) / 10}%`;
}

function RoleTable({ title, items }: { title: "幸存者" | "凯瑞甘"; items: PlayerRole[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-slate-900">{title}角色</h2>
        <div className="text-xs text-slate-500">仅显示 plays&gt;0 或 class_mmr≠0</div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
        <div className="grid grid-cols-[1fr_88px_88px_92px_72px] bg-slate-50 text-xs font-black text-slate-600">
          <div className="px-3 py-2">角色</div>
          <div className="px-3 py-2 text-right">MMR</div>
          <div className="px-3 py-2 text-right">修正</div>
          <div className="px-3 py-2 text-right">胜/场</div>
          <div className="px-3 py-2 text-right">胜率</div>
        </div>

        <div className="divide-y divide-slate-200">
          {items.map((r) => (
            <div
              key={`${title}-${r.role_id}-${r.role_name}`}
              className="grid grid-cols-[1fr_88px_88px_92px_72px] items-start text-sm"
            >
              <div className="px-3 py-2">
                <div className="font-black leading-5 text-slate-900 line-clamp-2">{r.role_name}</div>
                <div className="mt-0.5 text-xs text-slate-400">core {r.core_mmr}</div>
              </div>
              <div className="px-3 py-2 text-right font-black text-slate-900 tabular-nums">{r.mmr}</div>
              <div
                className={[
                  "px-3 py-2 text-right font-black tabular-nums",
                  r.class_mmr > 0 && "text-emerald-700",
                  r.class_mmr < 0 && "text-red-700",
                  r.class_mmr === 0 && "text-slate-700",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {fmtSigned(r.class_mmr)}
              </div>
              <div className="px-3 py-2 text-right font-bold text-slate-700 tabular-nums">
                {r.wins}/{r.plays}
              </div>
              <div className="px-3 py-2 text-right font-bold text-slate-700 tabular-nums">{pct(r.win_rate)}</div>
            </div>
          ))}
          {!items.length ? (
            <div className="px-3 py-6 text-center text-sm text-slate-500">暂无数据</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function PlayerRoleQuery() {
  const nav = useNavigate();
  const params = useParams<{ handle?: string }>();

  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlayerApiResponse | null>(null);
  const [recent, setRecent] = useState<RecentHandle[]>([]);
  const [lastLoadedHandle, setLastLoadedHandle] = useState<string | null>(null);

  useEffect(() => {
    setRecent(loadRecentHandles());
  }, []);

  const runQuery = useCallback(
    async (rawHandle: string, opts?: { pushUrl?: boolean }) => {
      const val = rawHandle.trim();
      if (!val) {
        setError("请输入玩家句柄");
        setData(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/player?player_handle=${encodeURIComponent(val)}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          if (res.status === 404) throw new Error("not found");
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as unknown;
        const parsed = parsePlayerApiResponse(json);
        if (!parsed) throw new Error("bad payload");
        setData(parsed);
        setRecent(saveRecentHandle(val));
        setLastLoadedHandle(val);
        if (opts?.pushUrl) {
          nav(`/player/${encodeURIComponent(val)}`, { replace: true });
        }
      } catch (e) {
        console.warn(e);
        setData(null);
        setLastLoadedHandle(null);
        if (e instanceof Error && e.message === "not found") {
          setError("未找到该玩家的数据。请确认句柄是否正确。");
        } else {
          setError("加载失败。请稍后再试。");
        }
      } finally {
        setLoading(false);
      }
    },
    [nav],
  );

  useEffect(() => {
    const p = typeof params.handle === "string" ? decodeURIComponent(params.handle) : "";
    if (!p) return;
    if (lastLoadedHandle && lastLoadedHandle.toUpperCase() === p.toUpperCase()) return;
    setHandle(p);
    runQuery(p, { pushUrl: false });
  }, [lastLoadedHandle, params.handle, runQuery]);

  const updatedAtText = useMemo(() => {
    if (!data?.generated_at) return "--";
    return `${formatTimeBeijingYYYYMMDDHHmm(data.generated_at)}（北京时间）`;
  }, [data?.generated_at]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-center text-lg font-black text-slate-900">角色数据查询</h1>
        <p className="mt-1 text-center text-sm text-slate-500">输入玩家句柄 (Handle) 查询角色 MMR 与战绩</p>

        <div className="mt-4 flex gap-2">
          <input
            className="w-full flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600"
            placeholder="例: 5-S2-1-10252842"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runQuery(handle, { pushUrl: true });
            }}
            autoComplete="off"
          />
          <button
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-70"
            onClick={() => runQuery(handle, { pushUrl: true })}
            disabled={loading}
          >
            {loading ? "查询中..." : "查询"}
          </button>
        </div>

        {!loading && !data && !error && recent.length ? (
          <div className="mt-3">
            <div className="text-xs font-bold text-slate-500">最近查询</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {recent.map((r) => (
                <button
                  key={r.handle}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setHandle(r.handle);
                    runQuery(r.handle, { pushUrl: true });
                  }}
                >
                  {r.handle}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
      ) : null}

      {data ? (
        <div className="mt-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-black text-slate-900">{data.player_handle}</div>
                <div className="mt-1 text-sm text-slate-500">
                  更新时间：<span className="font-bold text-slate-700">{updatedAtText}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-black text-slate-700">
                  幸存者核心 MMR：<span className="text-slate-900">{data.cores.survivor}</span>
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-black text-slate-700">
                  凯瑞甘核心 MMR：<span className="text-slate-900">{data.cores.kerrigan}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RoleTable title="幸存者" items={data.roles_survivor} />
            <RoleTable title="凯瑞甘" items={data.roles_kerrigan} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { loadRecentHandles, saveRecentHandle, type RecentHandle } from "../lib/recentHandles";
import { formatTimeBeijingYYYYMMDDHHmm } from "../lib/time";
import Modal from "./Modal";

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
  ranks?: {
    survivor: { percentile: number; tier: "青铜" | "白银" | "黄金" | "白金" | "钻石" | "大师" };
    kerrigan: { percentile: number; tier: "青铜" | "白银" | "黄金" | "白金" | "钻石" | "大师" };
  };
  leaderboard_ranks?: {
    survivor?: { rank: number; mmr: number; identity: string; display_name: string };
    kerrigan?: { rank: number; mmr: number; identity: string; display_name: string };
  };
  leaderboard_match?: {
    team_name: "幸存者" | "凯瑞甘";
    rank: number;
    mmr: number;
    identity: string;
    display_name: string;
  };
  top_uploader?: { name: string; num_uploads: number };
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

function TierPill({
  tier,
}: {
  tier: "青铜" | "白银" | "黄金" | "白金" | "钻石" | "大师";
}) {
  const color = (() => {
    if (tier === "大师") return "border-purple-200 bg-purple-50 text-purple-800";
    if (tier === "钻石") return "border-sky-200 bg-sky-50 text-sky-800";
    if (tier === "白金") return "border-teal-200 bg-teal-50 text-teal-800";
    if (tier === "黄金") return "border-amber-200 bg-amber-50 text-amber-800";
    if (tier === "白银") return "border-slate-200 bg-slate-50 text-slate-700";
    return "border-orange-200 bg-orange-50 text-orange-800";
  })();

  return (
    <span className={["inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black", color].join(" ")}>
      {tier}
    </span>
  );
}

function TeamMmrCard({
  team,
  mmr,
  tier,
  leaderboardRank,
}: {
  team: "幸存者" | "凯瑞甘";
  mmr: number;
  tier?: "青铜" | "白银" | "黄金" | "白金" | "钻石" | "大师";
  leaderboardRank?: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-black text-slate-900">{team}</div>
        <div className="flex items-center gap-2">
          {typeof leaderboardRank === "number" ? (
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-black text-slate-700">
              榜单 第{leaderboardRank}名
            </span>
          ) : null}
          {tier ? <TierPill tier={tier} /> : <span className="text-xs font-bold text-slate-400">--</span>}
        </div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-3xl font-black text-slate-900 tabular-nums">{mmr}</div>
        <div className="text-xs font-bold text-slate-500">核心 MMR</div>
      </div>
    </div>
  );
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
        <div className="grid grid-cols-[1fr_88px_92px_72px] bg-slate-50 text-xs font-black text-slate-600">
          <div className="px-3 py-2">角色</div>
          <div className="px-3 py-2 text-right">MMR</div>
          <div className="px-3 py-2 text-right">胜/场</div>
          <div className="px-3 py-2 text-right">胜率</div>
        </div>

        <div className="divide-y divide-slate-200">
          {items.map((r) => (
            <div
              key={`${title}-${r.role_id}-${r.role_name}`}
              className="grid grid-cols-[1fr_88px_92px_72px] items-start text-sm"
            >
              <div className="px-3 py-2">
                <div className="font-black leading-5 text-slate-900 line-clamp-2">{r.role_name}</div>
              </div>
              <div className="px-3 py-2 text-right font-black text-slate-900 tabular-nums">{r.mmr}</div>
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
  const [errorKind, setErrorKind] = useState<"not_found" | "failed" | null>(null);
  const [data, setData] = useState<PlayerApiResponse | null>(null);
  const [recent, setRecent] = useState<RecentHandle[]>([]);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const routeHandle = useMemo(
    () => (typeof params.handle === "string" ? decodeURIComponent(params.handle).trim() : ""),
    [params.handle],
  );

  useEffect(() => {
    setRecent(loadRecentHandles());
  }, []);

  const runQuery = useCallback(
    async (rawHandle: string) => {
      const val = rawHandle.trim();
      if (!val) {
        setError("请输入玩家句柄");
        setData(null);
        return;
      }

      setLoading(true);
      setError(null);
      setErrorKind(null);
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
      } catch (e) {
        console.warn(e);
        setData(null);
        if (e instanceof Error && e.message === "not found") {
          setErrorKind("not_found");
          setError("未找到该玩家的数据（可能不活跃或暂未收录）。");
        } else {
          setErrorKind("failed");
          setError("加载失败。请稍后再试。");
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!routeHandle) return;
    setHandle(routeHandle);
    runQuery(routeHandle);
  }, [routeHandle, runQuery]);

  const updatedAtText = useMemo(() => {
    if (!data?.generated_at) return "--";
    return `${formatTimeBeijingYYYYMMDDHHmm(data.generated_at)}（北京时间）`;
  }, [data?.generated_at]);

  const uploaderCount = data?.top_uploader?.num_uploads;
  const primaryLb =
    data?.leaderboard_match ??
    (data?.leaderboard_ranks?.kerrigan ? { team_name: "凯瑞甘" as const, ...data.leaderboard_ranks.kerrigan } : null) ??
    (data?.leaderboard_ranks?.survivor ? { team_name: "幸存者" as const, ...data.leaderboard_ranks.survivor } : null);

  const navigateOrQuery = useCallback(
    (raw: string) => {
      const val = raw.trim();
      if (!val) {
        setErrorKind(null);
        setError("请输入玩家句柄");
        setData(null);
        return;
      }

      if (routeHandle && routeHandle.toUpperCase() === val.toUpperCase()) {
        runQuery(val);
        return;
      }

      // 先更新 URL：就算查不到，也能落到 /player/:handle 并展示兜底页。
      setData(null);
      setError(null);
      setErrorKind(null);
      setLoading(true);
      nav(`/player/${encodeURIComponent(val)}`, { replace: true });
    },
    [nav, routeHandle, runQuery],
  );

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
              if (e.key === "Enter") navigateOrQuery(handle);
            }}
            autoComplete="off"
          />
          <button
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-70"
            onClick={() => navigateOrQuery(handle)}
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
                    navigateOrQuery(r.handle);
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
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-sm font-black text-slate-900">{error}</div>
              {errorKind === "not_found" ? (
                <div className="mt-1 text-sm text-slate-500">
                  这里只支持查询<strong className="font-black text-slate-700">活跃玩家</strong>。如果你是新玩家/很久未游玩，可能暂时查不到。
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                  onClick={() => navigateOrQuery(handle)}
                  disabled={loading}
                >
                  重新查询
                </button>
                <button
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-800"
                  onClick={() => nav("/", { replace: false })}
                >
                  返回首页
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {data ? (
        <div className="mt-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                {primaryLb ? (
                  <div className="text-sm text-slate-500">
                    <span className="font-bold text-slate-600">昵称：</span>
                    <span className="font-black text-slate-900">{primaryLb.display_name}</span>
                    <span className="mx-2 text-slate-300">|</span>
                    <span className="font-bold text-slate-600">战网：</span>
                    <span className="font-bold text-slate-700">{primaryLb.identity}</span>
                    {typeof uploaderCount === "number" ? (
                      <button
                        type="button"
                        className="ml-2 inline-flex cursor-pointer items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-800 transition hover:bg-rose-100"
                        title={`上传录像：${uploaderCount}`}
                        onClick={() => setUploaderOpen(true)}
                      >
                        顶级上传者
                      </button>
                    ) : null}
                  </div>
                ) : data.top_uploader ? (
                  <div className="text-sm text-slate-500">
                    <span className="font-bold text-slate-600">战网：</span>
                    <span className="font-black text-slate-900">{data.top_uploader.name}</span>
                    {typeof uploaderCount === "number" ? (
                      <button
                        type="button"
                        className="ml-2 inline-flex cursor-pointer items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-800 transition hover:bg-rose-100"
                        title={`上传录像：${uploaderCount}`}
                        onClick={() => setUploaderOpen(true)}
                      >
                        顶级上传者
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-1 text-sm font-black text-slate-900">{data.player_handle}</div>
                <div className="mt-1 text-sm text-slate-500">
                  更新时间：<span className="font-bold text-slate-700">{updatedAtText}</span>
                </div>
              </div>
              <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:min-w-[340px] sm:grid-cols-2">
                <TeamMmrCard
                  team="幸存者"
                  mmr={data.cores.survivor}
                  tier={data.ranks?.survivor.tier}
                  leaderboardRank={
                    data.leaderboard_ranks?.survivor?.rank ??
                    (data.leaderboard_match?.team_name === "幸存者" ? data.leaderboard_match.rank : undefined)
                  }
                />
                <TeamMmrCard
                  team="凯瑞甘"
                  mmr={data.cores.kerrigan}
                  tier={data.ranks?.kerrigan.tier}
                  leaderboardRank={
                    data.leaderboard_ranks?.kerrigan?.rank ??
                    (data.leaderboard_match?.team_name === "凯瑞甘" ? data.leaderboard_match.rank : undefined)
                  }
                />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RoleTable title="幸存者" items={data.roles_survivor} />
            <RoleTable title="凯瑞甘" items={data.roles_kerrigan} />
          </div>
        </div>
      ) : null}

      <Modal open={uploaderOpen} title="顶级上传者" onClose={() => setUploaderOpen(false)}>
        <div className="text-sm text-slate-700">
          上传录像：<span className="font-black tabular-nums">{typeof uploaderCount === "number" ? uploaderCount : "--"}</span>
        </div>
      </Modal>
    </div>
  );
}

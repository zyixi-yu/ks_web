import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { formatTimeBeijingYYYYMMDDHHmm } from "../lib/time";

type LeaderboardEntry = {
  rank: number;
  display_name: string;
  identity: string;
  handles: string[];
  mmr: number;
  team_name: "凯瑞甘" | "幸存者";
};

type LeaderboardResponse = {
  generated_at: string;
  boards: {
    kerrigan: LeaderboardEntry[];
    survivor: LeaderboardEntry[];
  };
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function parseLeaderboardResponse(x: unknown): LeaderboardResponse | null {
  if (!isRecord(x)) return null;
  if (typeof x.generated_at !== "string") return null;
  if (!isRecord(x.boards)) return null;
  const k = x.boards.kerrigan;
  const s = x.boards.survivor;
  if (!Array.isArray(k) || !Array.isArray(s)) return null;
  return x as LeaderboardResponse;
}

function BoardTable(props: {
  title: "凯瑞甘" | "幸存者";
  items: LeaderboardEntry[];
  onSelect: (row: LeaderboardEntry) => void;
}) {
  const { title, items, onSelect } = props;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-slate-900">{title}榜</h2>
        <div className="text-xs font-bold text-slate-500">Top 50</div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
        <div className="grid grid-cols-[56px_1fr_80px] gap-0 bg-slate-50 text-xs font-black text-slate-600">
          <div className="px-3 py-2">名次</div>
          <div className="px-3 py-2">玩家</div>
          <div className="px-3 py-2 text-right">MMR</div>
        </div>

        <div className="divide-y divide-slate-200">
          {items.map((row) => (
            <button
              type="button"
              key={`${row.team_name}-${row.rank}-${row.display_name}`}
              className="grid w-full grid-cols-[56px_1fr_80px] items-start gap-0 text-left text-sm text-slate-900 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              onClick={() => onSelect(row)}
            >
              <div className="px-3 py-2 font-black text-slate-700">#{row.rank}</div>

              <div className="px-3 py-2">
                <div className="font-black leading-5 text-slate-900 line-clamp-2">{row.display_name}</div>
                <div className="mt-0.5 text-xs text-slate-500">点击查看详情</div>
              </div>

              <div className="px-3 py-2 text-right font-black text-slate-900 tabular-nums">
                {row.mmr}
              </div>
            </button>
          ))}
          {!items.length ? (
            <div className="px-3 py-6 text-center text-sm text-slate-500">暂无数据</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);

  useEffect(() => {
    let canceled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/leaderboard", { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as unknown;
        const parsed = parseLeaderboardResponse(json);
        if (!parsed) throw new Error("bad payload");
        if (!canceled) setData(parsed);
      } catch (e) {
        console.warn(e);
        if (!canceled) {
          setError("加载失败。请稍后再试。");
          setData(null);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    load();
    return () => {
      canceled = true;
    };
  }, []);

  const updatedAtText = useMemo(() => {
    if (!data?.generated_at) return "--";
    return `${formatTimeBeijingYYYYMMDDHHmm(data.generated_at)}（北京时间）`;
  }, [data?.generated_at]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-black text-slate-900">游戏排行榜</h1>
            <div className="mt-1 text-sm text-slate-500">
              更新时间：<span className="font-bold text-slate-700">{updatedAtText}</span>
            </div>
          </div>
          <div className="text-xs text-slate-400">数据来源：KV（bridge_cn.json）</div>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          加载中...
        </div>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
      ) : !data ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          暂无数据
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BoardTable title="幸存者" items={data.boards.survivor} onSelect={setSelected} />
          <BoardTable title="凯瑞甘" items={data.boards.kerrigan} onSelect={setSelected} />
        </div>
      )}

      <Modal
        open={!!selected}
        title={selected ? `#${selected.rank} · ${selected.display_name}` : "玩家信息"}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-700">
                {selected.team_name}榜
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-700">
                MMR：<span className="text-slate-900">{selected.mmr}</span>
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-bold text-slate-500">玩家战网标识</div>
              <div className="mt-1 break-words text-sm font-black text-slate-900">
                {selected.identity || "--"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-bold text-slate-500">句柄</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selected.handles?.length ? (
                  selected.handles.map((h) => (
                    <span
                      key={h}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-800"
                    >
                      {h}
                    </span>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">--</div>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-400">（点击榜单条目查看句柄与更多信息）</div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

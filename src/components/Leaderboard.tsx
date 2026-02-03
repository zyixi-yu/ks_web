import React, { useEffect, useMemo, useState } from "react";
import * as Sentry from "@sentry/react";
import { formatTimeBeijingYYYYMMDDHHmm } from "../lib/time";
import { IconChevronRight } from "./NavDrawer";
import { useNavigate } from "react-router-dom";

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
  onJumpToPlayer: (row: LeaderboardEntry) => void;
}) {
  const { title, items, onJumpToPlayer } = props;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-slate-900">{title}榜</h2>
        <div className="text-right">
          <div className="text-xs font-black text-slate-500">Top 50</div>
          <div className="mt-0.5 text-[11px] text-slate-400">点击行查看角色数据</div>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
        <div className="grid grid-cols-[56px_1fr_80px_32px] gap-0 bg-slate-50 text-xs font-black text-slate-600">
          <div className="px-3 py-2">名次</div>
          <div className="px-3 py-2">玩家</div>
          <div className="px-3 py-2 text-right">MMR</div>
          <div className="px-2 py-2" />
        </div>

        <div className="divide-y divide-slate-200">
          {items.map((row) => (
            <button
              type="button"
              key={`${row.team_name}-${row.rank}-${row.display_name}`}
              className="grid w-full grid-cols-[56px_1fr_80px_32px] items-center gap-0 text-left text-sm text-slate-900 transition hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-600/30"
              onClick={() => onJumpToPlayer(row)}
            >
              <div className="px-3 py-2 font-black text-slate-700">#{row.rank}</div>

              <div className="px-3 py-2">
                <div className="font-black leading-5 text-slate-900 line-clamp-2">{row.display_name}</div>
              </div>

              <div className="px-3 py-2 text-right font-black text-slate-900 tabular-nums">
                {row.mmr}
              </div>
              <div className="flex items-center justify-center px-2 py-2 text-slate-400">
                <IconChevronRight className="h-5 w-5" />
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
  const { logger } = Sentry;
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LeaderboardResponse | null>(null);

  useEffect(() => {
    let canceled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        logger.info("leaderboard.load.start");
        const res = await Sentry.startSpan(
          { op: "http.client", name: "GET /api/leaderboard" },
          async () => await fetch("/api/leaderboard", { headers: { Accept: "application/json" } }),
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as unknown;
        const parsed = parseLeaderboardResponse(json);
        if (!parsed) throw new Error("bad payload");
        if (!canceled) setData(parsed);
        logger.info("leaderboard.load.ok", {
          survivor: parsed.boards.survivor.length,
          kerrigan: parsed.boards.kerrigan.length,
          generated_at: parsed.generated_at,
        });
      } catch (e) {
        console.warn(e);
        Sentry.captureException(e);
        logger.error("leaderboard.load.failed", { error: e instanceof Error ? e.message : String(e) });
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
  }, [logger]);

  const updatedAtText = useMemo(() => {
    if (!data?.generated_at) return "--";
    return `${formatTimeBeijingYYYYMMDDHHmm(data.generated_at)}（北京时间）`;
  }, [data?.generated_at]);

  function pickPlayerHandle(row: LeaderboardEntry): string {
    const candidates = [...(row.handles || []), row.identity].map((x) => (x || "").trim()).filter(Boolean);
    const handlePattern = /^\d+-S\d+-\d+-\d+$/;
    const preferred = candidates.find((x) => handlePattern.test(x));
    return preferred || candidates[0] || "";
  }

  function jumpToPlayer(row: LeaderboardEntry) {
    const handle = pickPlayerHandle(row);
    if (!handle) {
      nav("/player", { replace: false });
      return;
    }
    logger.info("leaderboard.row.click", { team_name: row.team_name, rank: row.rank, player_handle: handle });
    nav(`/player/${encodeURIComponent(handle)}`, { replace: false });
  }

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
          <BoardTable title="幸存者" items={data.boards.survivor} onJumpToPlayer={jumpToPlayer} />
          <BoardTable title="凯瑞甘" items={data.boards.kerrigan} onJumpToPlayer={jumpToPlayer} />
        </div>
      )}
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { copyToClipboard } from "../lib/clipboard";
import { computeCreditBreakdown, decodeCreditCode, type CreditsResponse } from "../lib/credits";
import { formatTimeCN } from "../lib/time";

type CreditsResult = {
  data: CreditsResponse;
  decoded: { amount: number; lucy_credits: number };
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

export default function CreditsQuery() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreditsResult | null>(null);
  const [copied, setCopied] = useState(false);

  const command = useMemo(() => {
    if (!result?.data?.code) return "";
    return `-lucy ${result.data.code}`;
  }, [result]);

  const breakdown = useMemo(() => {
    if (!result) return null;
    return computeCreditBreakdown(result.data, result.decoded);
  }, [result]);

  async function fetchCredits() {
    const val = handle.trim();
    if (!val) {
      setError("请输入玩家句柄");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/credits?player_handle=${encodeURIComponent(val)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CreditsResponse;
      if (!isNonEmptyString(data?.code)) throw new Error("返回数据格式错误或玩家不存在");
      const decoded = decodeCreditCode(data.code);
      setResult({ data, decoded });
    } catch (e) {
      console.warn(e);
      setError("查询失败。请检查句柄是否正确（如：5-S2-1-xxxxx），或稍后再试。");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-black text-slate-900">积分查询</h1>
        <p className="mt-1 text-sm text-slate-500">输入玩家句柄 (Handle) 查询积分与指令</p>

        <div className="mt-4 flex gap-2">
          <input
            className="w-full flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600"
            placeholder="例: 5-S2-1-10252842"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") fetchCredits();
            }}
            autoComplete="off"
          />
          <button
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-70"
            onClick={fetchCredits}
            disabled={loading}
          >
            {loading ? "查询中..." : "查询"}
          </button>
        </div>

        {loading ? (
          <div className="mt-4 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          </div>
        ) : null}
        {error ? <div className="mt-3 text-sm leading-6 text-red-600">{error}</div> : null}

        {result ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-800 p-4 text-white shadow-lg shadow-blue-600/20">
              <div className="text-xs font-extrabold uppercase tracking-wide opacity-90">游戏内领取指令</div>
              <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-sm break-all">
                {command}
              </div>
              <button
                className="mt-3 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-black text-blue-700 transition active:scale-[0.99]"
                onClick={async () => {
                  if (!command) return;
                  const ok = await copyToClipboard(command);
                  setCopied(ok);
                  setTimeout(() => setCopied(false), 1600);
                }}
              >
                {copied ? "复制成功!" : "点击一键复制"}
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-bold text-slate-500">账号总积分 (存档恢复)</div>
                <div className="mt-1 text-2xl font-black text-slate-900">
                  {result.decoded.amount.toLocaleString()}
                </div>
                <div className="mt-3 border-t border-dashed border-slate-200 pt-3 text-xs leading-5 text-slate-500">
                  若存档丢失会根据此分进行恢复
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-bold text-slate-500">总奖励积分</div>
                <div className="mt-1 text-2xl font-black text-emerald-600">
                  {result.decoded.lucy_credits.toLocaleString()}
                </div>

                <div className="mt-3 border-t border-dashed border-slate-200 pt-3 text-xs text-slate-500">
                  <div className="flex items-start justify-between gap-3">
                    <span>录像上传奖励</span>
                    <span className="font-bold text-slate-900">
                      {breakdown ? `${breakdown.replays}局 × 2 = ${breakdown.replays * 2}` : "-"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <span>离场扣分（作为凯瑞甘队伍，9分钟前离场）</span>
                    <span className="font-bold text-red-600">
                      {breakdown ? (breakdown.penalty > 0 ? `-${breakdown.penalty * 10}` : "无") : "-"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <span>额外积分奖励</span>
                    <span className="font-bold text-slate-900">
                      {breakdown
                        ? breakdown.bonus !== 0
                          ? breakdown.bonus > 0
                            ? `+${breakdown.bonus}`
                            : `${breakdown.bonus}`
                          : "0"
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-orange-800">
              请注意：数据最后更新于{" "}
              <span className="font-black text-slate-900">
                {typeof result.data.updated === "number"
                  ? formatTimeCN(result.data.updated * 1000)
                  : "--"}
              </span>{" "}
              (若刚上传录像请稍后刷新)
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

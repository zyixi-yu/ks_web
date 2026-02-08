import React, { useEffect, useMemo, useState } from "react";
import * as Sentry from "@sentry/react";
import { copyToClipboard } from "../lib/clipboard";
import { computeCreditBreakdown, decodeCreditCode, type CreditsResponse } from "../lib/credits";
import { deleteRecentHandle, loadRecentHandles, saveRecentHandle, type RecentHandle } from "../lib/recentHandles";
import { formatTimeCN } from "../lib/time";

type CreditsResult = {
  data: CreditsResponse;
  decoded: { amount: number; lucy_credits: number };
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

export default function CreditsQuery() {
  const { logger } = Sentry;
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreditsResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [recent, setRecent] = useState<RecentHandle[]>([]);

  useEffect(() => {
    setRecent(loadRecentHandles());
  }, []);

  const command = useMemo(() => {
    if (!result?.data?.code) return "";
    return `-lucy ${result.data.code}`;
  }, [result]);

  const breakdown = useMemo(() => {
    if (!result) return null;
    return computeCreditBreakdown(result.data, result.decoded);
  }, [result]);

  async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchCreditsViaProxies(playerHandle: string): Promise<CreditsResponse> {
    const targetUrl = `https://credits.replayanalyzer.com/?player_handle=${encodeURIComponent(playerHandle)}`;

    const proxies: Array<{
      name: string;
      buildUrl: (url: string) => string;
      parse: (res: Response) => Promise<CreditsResponse>;
    }> = [
      {
        name: "allorigins",
        buildUrl: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        parse: async (res) => {
          const json = (await res.json()) as any;
          return JSON.parse(String(json?.contents || "{}")) as CreditsResponse;
        },
      },
      {
        name: "thingproxy",
        buildUrl: (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
        parse: async (res) => (await res.json()) as CreditsResponse,
      },
      {
        name: "cors.eu.org",
        buildUrl: (url) => `https://cors.eu.org/${url}`,
        parse: async (res) => (await res.json()) as CreditsResponse,
      },
    ];

    let lastErr: unknown = null;
    for (const proxy of proxies) {
      try {
        logger.debug(logger.fmt`credits.proxy.try ${proxy.name} for ${playerHandle}`);
        const res = await fetchWithTimeout(proxy.buildUrl(targetUrl), 8000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await proxy.parse(res);
        if (!isNonEmptyString((data as any)?.code)) throw new Error("bad payload");
        logger.info("credits.proxy.ok", { proxy: proxy.name });
        return data;
      } catch (e) {
        lastErr = e;
        console.warn(`credits proxy failed: ${proxy.name}`, e);
        logger.warn("credits.proxy.failed", { proxy: proxy.name, error: e instanceof Error ? e.message : String(e) });
      }
    }

    throw lastErr instanceof Error ? lastErr : new Error("all proxies failed");
  }

  async function fetchCreditsViaApi(playerHandle: string): Promise<CreditsResponse> {
    const url = new URL("/api/credits", window.location.origin);
    url.searchParams.set("player_handle", playerHandle);

    const res = await fetchWithTimeout(url.toString(), 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as CreditsResponse;
    if (!isNonEmptyString((data as any)?.code)) throw new Error("bad payload");
    return data;
  }

  async function fetchCreditsPreferred(playerHandle: string): Promise<CreditsResponse> {
    try {
      logger.debug(logger.fmt`credits.api.try for ${playerHandle}`);
      const data = await fetchCreditsViaApi(playerHandle);
      logger.info("credits.api.ok");
      return data;
    } catch (e) {
      console.warn("credits api failed, fallback to proxies", e);
      logger.warn("credits.api.failed", { error: e instanceof Error ? e.message : String(e) });
    }

    return await fetchCreditsViaProxies(playerHandle);
  }

  async function runQuery(rawHandle: string) {
    const val = rawHandle.trim();
    if (!val) {
      setError("请输入玩家句柄");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      logger.info("credits.query.start", { player_handle: val });
      const data = await Sentry.startSpan(
        { op: "http.client", name: "GET credits (api -> proxies)" },
        async () => await fetchCreditsPreferred(val),
      );
      if (!isNonEmptyString(data?.code)) throw new Error("返回数据格式错误或玩家不存在");
      const decoded = Sentry.startSpan({ op: "function", name: "decodeCreditCode" }, () => decodeCreditCode(data.code!));
      setResult({ data, decoded });
      setRecent(saveRecentHandle(val));
      logger.info("credits.query.ok", {
        replays: data.replays ?? 0,
        penalty: data.penalty ?? 0,
        updated: typeof data.updated === "number" ? data.updated : null,
      });
    } catch (e) {
      console.warn(e);
      Sentry.captureException(e);
      logger.error("credits.query.failed", { player_handle: val, error: e instanceof Error ? e.message : String(e) });
      setError("查询失败。请检查句柄是否正确（如：5-S2-1-xxxxx），或稍后再试。");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-center text-lg font-black text-slate-900">积分查询</h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          输入玩家句柄 (Handle) 查询积分与指令 ·{" "}
          <a
            href="https://acnhqowv5wij.feishu.cn/wiki/PeU2ww3cuihWQgkCe5zcvOh1nCd"
            target="_blank"
            rel="noreferrer"
            className="font-black text-blue-700 hover:text-blue-800 hover:underline"
          >
            帮助文档
          </a>
        </p>

        <div className="mt-4 flex gap-2">
          <input
            className="w-full flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600"
            placeholder="例: 5-S2-1-10252842"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runQuery(handle);
            }}
            autoComplete="off"
          />
          <button
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-70"
            onClick={() => runQuery(handle)}
            disabled={loading}
          >
            {loading ? "查询中..." : "查询"}
          </button>
        </div>

        {!loading && !result && !error && recent.length ? (
          <div className="mt-3">
            <div className="text-xs font-bold text-slate-500">最近查询</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {recent.map((item) => (
                <div
                  key={item.handle}
                  className="inline-flex items-center overflow-hidden rounded-full border border-slate-200 bg-slate-50"
                  title={`上次查询：${formatTimeCN(item.lastUsed)}`}
                >
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                    onClick={() => {
                      setHandle(item.handle);
                      runQuery(item.handle);
                    }}
                    disabled={loading}
                  >
                    {item.handle}
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1.5 text-xs font-black text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="删除该条记录"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRecent(deleteRecentHandle(item.handle));
                    }}
                    disabled={loading}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

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

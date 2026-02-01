import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

type I18nSearchItem = {
  key: string;
  en: string;
  cn: string;
};

type I18nSearchResponse = {
  total: number;
  page: number;
  pageSize: number;
  items: I18nSearchItem[];
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function parseResponse(x: unknown): I18nSearchResponse | null {
  if (!isRecord(x)) return null;
  if (typeof x.total !== "number") return null;
  if (typeof x.page !== "number") return null;
  if (typeof x.pageSize !== "number") return null;
  if (!Array.isArray(x.items)) return null;
  return x as I18nSearchResponse;
}

function clampPage(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return 1;
  return Math.floor(p);
}

export default function I18nSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = (searchParams.get("q") || "").trim();
  const page = clampPage(Number.parseInt(searchParams.get("page") || "1", 10));
  const pageSize = 20;

  const [input, setInput] = useState(q);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<I18nSearchResponse | null>(null);

  useEffect(() => {
    setInput(q);
  }, [q]);

  useEffect(() => {
    if (!q) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    let canceled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/i18n/search", window.location.origin);
        url.searchParams.set("q", q);
        url.searchParams.set("page", String(page));
        url.searchParams.set("pageSize", String(pageSize));
        const res = await fetch(url.toString(), {
          signal: ac.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as unknown;
        const parsed = parseResponse(json);
        if (!parsed) throw new Error("bad payload");
        if (!canceled) setData(parsed);
      } catch (e) {
        if ((e as any)?.name === "AbortError") return;
        console.warn(e);
        if (!canceled) {
          setError("查询失败。请稍后再试。");
          setData(null);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    load();
    return () => {
      canceled = true;
      ac.abort();
    };
  }, [page, pageSize, q]);

  const pages = useMemo(() => {
    const total = data?.total ?? 0;
    if (!total) return 1;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [data?.total, pageSize]);

  const pageText = useMemo(() => {
    if (!q) return "请输入中文进行搜索。支持多关键词（空格分隔）。";
    if (loading) return "查询中...";
    if (error) return error;
    if (!data) return "暂无数据";
    return `共 ${data.total} 条 · 第 ${data.page} / ${pages} 页`;
  }, [data, error, loading, pages, q]);

  function submit(nextQ: string) {
    const trimmed = nextQ.trim();
    if (!trimmed) {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ q: trimmed, page: "1" }, { replace: true });
  }

  function gotoPage(nextPage: number) {
    const p = Math.min(Math.max(1, nextPage), pages);
    if (!q) return;
    setSearchParams({ q, page: String(p) }, { replace: true });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-black text-slate-900">玩家搜索翻译</h1>
            <div className="mt-1 text-sm text-slate-500">{pageText}</div>
          </div>
        </div>

        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入中文关键词，支持空格分隔多个关键词"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-600/10"
            autoComplete="off"
          />
          <button
            type="submit"
            className="h-11 shrink-0 rounded-xl bg-slate-900 px-5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-900/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            搜索
          </button>
        </form>
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">加载中...</div>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
      ) : !q ? null : !data?.items?.length ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">未找到匹配内容</div>
      ) : (
        <div className="mt-4 space-y-3">
          {data.items.map((row) => (
            <div key={row.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono text-xs font-bold text-slate-500">{row.key}</div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-700">
                  key
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-black text-slate-600">英文原文</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">
                    {row.en || "--"}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-black text-slate-600">中文翻译</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">
                    {row.cn || "--"}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:flex-row">
            <div className="text-slate-600">
              共 <span className="font-black text-slate-900">{data.total}</span> 条
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-10 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => gotoPage(page - 1)}
                disabled={page <= 1}
              >
                上一页
              </button>
              <div className="min-w-[120px] text-center text-slate-700">
                第 <span className="font-black text-slate-900">{Math.min(page, pages)}</span> / {pages} 页
              </div>
              <button
                type="button"
                className="h-10 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => gotoPage(page + 1)}
                disabled={page >= pages}
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

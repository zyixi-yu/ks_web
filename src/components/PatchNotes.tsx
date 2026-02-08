import React, { useCallback, useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/react";

type PatchNoteEntry = {
  version: string;
  date: string;
  notes: string[];
  checksum?: string;
  discord_snowflake?: string;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function parsePatchNotesResponse(
  x: unknown,
): { total: number; page: number; page_size: number; items: PatchNoteEntry[] } | null {
  if (!isRecord(x)) return null;
  if (typeof x.total !== "number") return null;
  if (typeof x.page !== "number") return null;
  if (typeof x.page_size !== "number") return null;
  if (!Array.isArray(x.items)) return null;
  return x as { total: number; page: number; page_size: number; items: PatchNoteEntry[] };
}

const PAGE_SIZE = 20;

export default function PatchNotes() {
  const { logger } = Sentry;
  const [entries, setEntries] = useState<PatchNoteEntry[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const loadPage = useCallback(
    async (p: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        logger.info("patchnotes.load.start", { page: p });
        const res = await Sentry.startSpan(
          { op: "http.client", name: "GET /api/patchnotes" },
          async (span) => {
            span.setAttribute("page", p);
            span.setAttribute("page_size", PAGE_SIZE);
            return await fetch(`/api/patchnotes?page=${p}&page_size=${PAGE_SIZE}`, {
              headers: { Accept: "application/json" },
            });
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as unknown;
        const parsed = parsePatchNotesResponse(json);
        if (!parsed) throw new Error("bad payload");

        setEntries((prev) => [...prev, ...parsed.items]);
        setPage(p + 1);
        if (parsed.items.length < parsed.page_size || p * parsed.page_size >= parsed.total) {
          setHasMore(false);
        }
        logger.info("patchnotes.load.ok", { page: p, items: parsed.items.length, total: parsed.total });
      } catch (e) {
        console.warn(e);
        Sentry.captureException(e);
        logger.error("patchnotes.load.failed", { page: p, error: e instanceof Error ? e.message : String(e) });
        setError("加载失败。请稍后再试。");
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [logger],
  );

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingRef.current) {
          loadPage(page);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, page, loadPage]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-black text-slate-900">更新日志</h1>
        <p className="mt-1 text-sm text-slate-500">Kerrigan Survival 各版本更新内容</p>
      </div>

      {error && !entries.length && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {entries.map((entry, idx) => (
        <div key={`${entry.version}-${idx}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-lg bg-cyan-50 px-2.5 py-1 text-sm font-black text-cyan-800 border border-cyan-200">
              v{entry.version}
            </span>
            <span className="text-sm text-slate-500">{entry.date}</span>
          </div>
          <div className="mt-3 text-sm leading-relaxed text-slate-700 whitespace-pre-line">
            {entry.notes.join("")}
          </div>
        </div>
      ))}

      {loading && (
        <div className="flex items-center justify-center py-6 text-sm text-slate-500">
          <svg className="mr-2 h-4 w-4 animate-spin text-cyan-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          加载中...
        </div>
      )}

      {!hasMore && entries.length > 0 && (
        <div className="py-6 text-center text-sm text-slate-400">已加载全部更新日志</div>
      )}

      {hasMore && <div ref={sentinelRef} className="h-1" />}
    </div>
  );
}

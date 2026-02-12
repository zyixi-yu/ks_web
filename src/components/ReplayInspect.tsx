import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Sentry from "@sentry/react";
import { Link, useNavigate } from "react-router-dom";
import { validateReplayFile } from "../lib/replayUpload";
import { IconChevronRight } from "./NavDrawer";

let roleMapCache: Record<string, string> | null = null;

async function fetchRoleMap(timeoutMs = 8000): Promise<Record<string, string>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/role-map", { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    const map = (json as any as RoleMapResponse)?.role_id_to_name;
    if (!map || typeof map !== "object") throw new Error("bad payload");
    return map as Record<string, string>;
  } finally {
    clearTimeout(t);
  }
}

type ParseResult = {
  map_name: string;
  supported: boolean;
  players: Array<{ name: string; handle: string; role_id: number | null }>;
};

type RoleMapResponse = {
  generated_at: string;
  role_id_to_name: Record<string, string>;
};

type Status = "idle" | "reading" | "parsing" | "done" | "error";

function decodeInspectText(input: string): string {
  return (input || "")
    .replace(/<sp\s*\/\s*>/gi, " ")
    .replace(/<n\s*\/\s*>/gi, "\n")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export default function ReplayInspect() {
  const { logger } = Sentry;
  const nav = useNavigate();
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [roleMap, setRoleMap] = useState<Record<string, string> | null>(null);
  const [roleMapError, setRoleMapError] = useState<string | null>(null);
  const [roleMapLoading, setRoleMapLoading] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    logger.info("replay.inspect.page.open");
    const w = new Worker(new URL("../workers/replayInspect.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    logger.info("replay.inspect.worker.ready");
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      logger.info("replay.inspect.page.close");
    };
  }, [logger]);

  const supported = result?.supported ?? false;

  // App-level cache: fetch role_id -> role_name mapping once on first visit.
  // After cached, switching routes back/forth won't re-request.
  useEffect(() => {
    let alive = true;

    if (roleMapCache) {
      setRoleMap(roleMapCache);
      setRoleMapLoading(false);
      setRoleMapError(null);
      logger.info("replay.inspect.role_map.cache_hit", { size: Object.keys(roleMapCache).length });
      return () => {
        alive = false;
      };
    }

    async function loadRoleMap() {
      setRoleMapLoading(true);
      setRoleMapError(null);
      logger.info("replay.inspect.role_map.load.start");
      try {
        const map = await fetchRoleMap(8000);
        roleMapCache = map;
        if (!alive) return;
        setRoleMap(map);
        logger.info("replay.inspect.role_map.load.ok", { size: Object.keys(map).length });
      } catch (e) {
        if (!alive) return;
        setRoleMapError(e instanceof Error ? e.message : String(e));
        logger.error("replay.inspect.role_map.load.failed", { error: e instanceof Error ? e.message : String(e) });
      } finally {
        if (alive) setRoleMapLoading(false);
      }
    }

    void loadRoleMap();
    return () => {
      alive = false;
    };
  }, [logger]);

  function formatRoleName(name: string): string {
    // Display-only: backend may use underscores for multi-word roles (e.g. Team_Nova).
    return (name || "").replace(/_/g, " ");
  }

  function roleText(roleId: number | null): string {
    if (roleId == null) return "Unknown";
    const raw = roleMap?.[String(roleId)] || "";
    return raw ? formatRoleName(raw) : `#${roleId}`;
  }

  const parseFile = async (file: File) => {
    logger.info("replay.inspect.parse.start", { file: file.name, size: file.size });
    setFileName(file.name);
    setError(null);
    setResult(null);

    const fileErr = await validateReplayFile(file);
    if (fileErr) {
      setStatus("error");
      setError(fileErr);
      logger.warn("replay.inspect.validation_failed", { file: file.name, error: fileErr });
      return;
    }

    setStatus("reading");
    let buffer: ArrayBuffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (e) {
      setStatus("error");
      setError("读取文件失败");
      Sentry.captureException(e);
      logger.error("replay.inspect.read.failed", { file: file.name, error: e instanceof Error ? e.message : String(e) });
      return;
    }

    const w = workerRef.current;
    if (!w) {
      setStatus("error");
      setError("Worker 未初始化");
      logger.error("replay.inspect.worker.missing");
      return;
    }

    setStatus("parsing");
    const id = ++requestIdRef.current;
    logger.info("replay.inspect.worker.start", { id, file: file.name, bytes: buffer.byteLength });

    const onMessage = (evt: MessageEvent) => {
      const msg = evt.data as { id: number; ok: boolean; result?: ParseResult; error?: string };
      if (msg.id !== id) return;
      w.removeEventListener("message", onMessage);

      if (msg.ok && msg.result) {
        setResult(msg.result);
        setStatus("done");
        logger.info("replay.inspect.parse.ok", {
          id,
          players: msg.result.players.length,
          unknown_roles: msg.result.players.filter((p) => p.role_id == null).length,
          supported: msg.result.supported,
        });
        return;
      }

      setStatus("error");
      setError(msg.error || "解析失败");
      logger.error("replay.inspect.parse.failed", { id, error: msg.error || "解析失败" });
    };

    w.addEventListener("message", onMessage);
    w.postMessage({ id, buffer }, [buffer]);
  };

  const parseFromIncoming = useCallback(
    (incoming: FileList | File[], source: "drop" | "picker") => {
      const list = Array.from(incoming);
      if (!list.length) return;
      const replay = list.find((f) => f.name.toLowerCase().endsWith(".sc2replay")) ?? list[0];
      logger.info("replay.inspect.file.selected", {
        source,
        file: replay.name,
        size: replay.size,
        total_incoming: list.length,
      });
      void parseFile(replay);
    },
    [logger, parseFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      parseFromIncoming(e.dataTransfer.files, "drop");
    },
    [parseFromIncoming],
  );

  const jumpToCredits = (handle: string) => {
    logger.info("replay.inspect.row.click", { player_handle: handle });
    nav(`/?handle=${encodeURIComponent(handle)}`, { replace: false });
  };

  // copy removed (row click jumps to credits)

  const titleLine = useMemo(() => {
    if (status === "idle") return "录像解析（本地）";
    if (status === "reading") return "读取文件中...";
    if (status === "parsing") return "解析中...";
    if (status === "done") return "解析完成";
    return "解析失败";
  }, [status]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-center text-lg font-black text-slate-900">{titleLine}</h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          上传一局 <span className="font-black text-slate-700">凯瑞甘生存</span> 游戏录像，提取玩家句柄 (Handle) ·{" "}
          <Link to="/" className="font-black text-blue-700 hover:text-blue-800 hover:underline">
            返回首页
          </Link>
        </p>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-black text-slate-700">选择录像文件</div>
          <div
            className={[
              "mt-2 flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition",
              dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400 hover:bg-white",
            ].join(" ")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-slate-400" aria-hidden="true">
              <path d="M12 16V4m0 0L8 8m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="text-center text-sm text-slate-500">
              拖拽 <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.SC2Replay</code> 到这里，或点击手动选择
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".SC2Replay,.sc2replay"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) parseFromIncoming(e.target.files, "picker");
              e.target.value = "";
            }}
          />
          {fileName && <div className="mt-2 text-xs text-slate-500">当前文件：{fileName}</div>}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-black text-slate-500">地图名称</div>
              <div className="mt-1 break-words whitespace-pre-wrap text-sm font-black text-slate-900">
                {decodeInspectText(result.map_name) || "(未知)"}
              </div>
              {!supported && (
                <div className="mt-2 text-xs text-slate-500">
                  非凯瑞甘生存地图（标题不包含 “凯瑞甘生存 / Kerrigan Survival”），不支持解析玩家信息。
                </div>
              )}
            </div>

            {supported && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-black text-slate-700">玩家信息</div>

                {roleMapLoading ? <div className="mt-2 text-xs text-slate-400">加载角色名称映射中...</div> : null}
                {roleMapError ? (
                  <div className="mt-2 text-xs text-amber-700">
                    角色名称映射加载失败（{roleMapError}），将用 role_id 兜底显示。
                  </div>
                ) : null}

                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  <div className="grid grid-cols-[minmax(0,1fr)_36px] gap-0 bg-slate-50 text-left text-xs font-black text-slate-600 sm:grid-cols-[minmax(0,1fr)_170px_150px_72px]">
                    <div className="px-3 py-2">昵称</div>
                    <div className="hidden px-3 py-2 sm:block">句柄</div>
                    <div className="hidden px-3 py-2 sm:block">角色</div>
                    <div className="px-2 py-2" />
                  </div>

                  <div className="divide-y divide-slate-200">
                    {result.players.map((p) => (
                      <div
                        key={p.handle}
                        role="button"
                        tabIndex={0}
                        className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-0 text-left text-sm text-slate-900 transition hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-600/30 sm:grid-cols-[minmax(0,1fr)_170px_150px_72px]"
                        onClick={() => jumpToCredits(p.handle)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") jumpToCredits(p.handle);
                        }}
                      >
                        <div className="min-w-0 px-3 py-2">
                          <div className="truncate font-bold text-slate-800 sm:line-clamp-2 sm:break-words">{decodeInspectText(p.name)}</div>
                          <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500 sm:hidden" title={p.handle}>
                            {p.handle}
                          </div>
                          <div
                            className="mt-0.5 text-xs text-slate-500 sm:hidden"
                            title={p.role_id == null ? "Unknown" : String(p.role_id)}
                          >
                            {roleText(p.role_id)}
                          </div>
                        </div>
                        <div className="hidden px-3 py-2 font-mono text-xs text-slate-700 truncate sm:block" title={p.handle}>
                          {p.handle}
                        </div>
                        <div
                          className="hidden px-3 py-2 text-slate-700 break-words sm:block"
                          title={p.role_id == null ? "Unknown" : String(p.role_id)}
                        >
                          {roleText(p.role_id)}
                        </div>
                        <div className="flex items-center justify-center px-2 py-2 text-slate-300">
                          <IconChevronRight className="h-5 w-5" />
                        </div>
                      </div>
                    ))}

                    {!result.players.length ? (
                      <div className="px-3 py-6 text-center text-sm text-slate-500">
                        没解析到玩家信息（可能是录像不完整或版本不兼容）
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// (icon removed)

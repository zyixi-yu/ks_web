import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { validateReplayFile } from "../lib/replayUpload";
import { IconChevronRight } from "./NavDrawer";

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

export default function ReplayInspect() {
  const nav = useNavigate();
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [roleMap, setRoleMap] = useState<Record<string, string> | null>(null);
  const [roleMapError, setRoleMapError] = useState<string | null>(null);
  const [roleMapLoading, setRoleMapLoading] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const w = new Worker(new URL("../workers/replayInspect.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const supported = result?.supported ?? false;

  useEffect(() => {
    if (!supported) return;
    if (roleMap || roleMapLoading) return;

    let alive = true;
    async function loadRoleMap() {
      setRoleMapLoading(true);
      setRoleMapError(null);
      try {
        const res = await fetch("/api/role-map", { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as unknown;
        const map = (json as any as RoleMapResponse)?.role_id_to_name;
        if (!map || typeof map !== "object") throw new Error("bad payload");
        if (!alive) return;
        setRoleMap(map as Record<string, string>);
      } catch (e) {
        if (!alive) return;
        setRoleMap(null);
        setRoleMapError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setRoleMapLoading(false);
      }
    }

    void loadRoleMap();
    return () => {
      alive = false;
    };
  }, [supported, roleMap, roleMapLoading]);

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
    setFileName(file.name);
    setError(null);
    setResult(null);

    const fileErr = await validateReplayFile(file);
    if (fileErr) {
      setStatus("error");
      setError(fileErr);
      return;
    }

    setStatus("reading");
    const buffer = await file.arrayBuffer();

    const w = workerRef.current;
    if (!w) {
      setStatus("error");
      setError("Worker 未初始化");
      return;
    }

    setStatus("parsing");
    const id = ++requestIdRef.current;

    const onMessage = (evt: MessageEvent) => {
      const msg = evt.data as { id: number; ok: boolean; result?: ParseResult; error?: string };
      if (msg.id !== id) return;
      w.removeEventListener("message", onMessage);

      if (msg.ok && msg.result) {
        setResult(msg.result);
        setStatus("done");
        return;
      }

      setStatus("error");
      setError(msg.error || "解析失败");
    };

    w.addEventListener("message", onMessage);
    w.postMessage({ id, buffer }, [buffer]);
  };

  const jumpToCredits = (handle: string) => {
    nav(`/?handle=${encodeURIComponent(handle)}`, { replace: false });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

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
          <label className="block text-sm font-black text-slate-700">选择录像文件</label>
          <input
            type="file"
            accept=".SC2Replay,.sc2replay"
            className="mt-2 block w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void parseFile(f);
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
              <div className="mt-1 break-words text-sm font-black text-slate-900">{result.map_name || "(未知)"}</div>
              {!supported && (
                <div className="mt-2 text-xs text-slate-500">
                  非凯瑞甘生存地图（标题不包含 “凯瑞甘生存 / Kerrigan Survival”），不支持解析玩家信息。
                </div>
              )}
            </div>

            {supported && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-end justify-between gap-3">
                  <div className="text-sm font-black text-slate-700">玩家信息</div>
                  <div className="text-[11px] text-slate-400">点击行：跳转回首页自动查询积分</div>
                </div>

                {roleMapLoading ? <div className="mt-2 text-xs text-slate-400">加载角色名称映射中...</div> : null}
                {roleMapError ? (
                  <div className="mt-2 text-xs text-amber-700">
                    角色名称映射加载失败（{roleMapError}），将用 role_id 兜底显示。
                  </div>
                ) : null}

                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  <div className="grid grid-cols-[minmax(0,1fr)_140px_72px] gap-0 bg-slate-50 text-left text-xs font-black text-slate-600 sm:grid-cols-[minmax(0,1fr)_200px_120px_72px]">
                    <div className="px-3 py-2">昵称</div>
                    <div className="px-3 py-2">Handle</div>
                    <div className="hidden px-3 py-2 sm:block">角色</div>
                    <div className="px-2 py-2" />
                  </div>

                  <div className="divide-y divide-slate-200">
                    {result.players.map((p) => (
                      <div
                        key={p.handle}
                        role="button"
                        tabIndex={0}
                        className="grid grid-cols-[minmax(0,1fr)_140px_72px] items-center gap-0 text-left text-sm text-slate-900 transition hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-600/30 sm:grid-cols-[minmax(0,1fr)_200px_120px_72px]"
                        onClick={() => jumpToCredits(p.handle)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") jumpToCredits(p.handle);
                        }}
                      >
                        <div className="min-w-0 px-3 py-2">
                          <div className="font-bold text-slate-800 line-clamp-2 break-words">{p.name}</div>
                          <div
                            className="mt-0.5 text-xs text-slate-500 sm:hidden"
                            title={p.role_id == null ? "Unknown" : String(p.role_id)}
                          >
                            {roleText(p.role_id)}
                          </div>
                        </div>
                        <div className="px-3 py-2 font-mono text-xs text-slate-700 truncate" title={p.handle}>
                          {p.handle}
                        </div>
                        <div
                          className="hidden px-3 py-2 text-slate-700 truncate sm:block"
                          title={p.role_id == null ? "Unknown" : String(p.role_id)}
                        >
                          {roleText(p.role_id)}
                        </div>
                        <div className="flex items-center justify-center gap-1 px-2 py-2">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                            aria-label="复制句柄"
                            title="复制句柄"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void copy(p.handle);
                            }}
                          >
                            <IconCopy className="h-4 w-4" />
                          </button>
                          <IconChevronRight className="h-5 w-5 text-slate-300" />
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

function IconCopy(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path
        d="M9 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M7 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

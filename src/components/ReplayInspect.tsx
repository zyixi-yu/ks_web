import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

type ParseResult = {
  map_name: string;
  supported: boolean;
  players: Array<{ name: string; handle: string; role: string }>;
};

type Status = "idle" | "reading" | "parsing" | "done" | "error";

export default function ReplayInspect() {
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const parseFile = async (file: File) => {
    setFileName(file.name);
    setError(null);
    setResult(null);

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

  const supported = result?.supported ?? false;

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
          选择 <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.SC2Replay</code> 文件后在浏览器本地解析 ·{" "}
          <Link to="/" className="font-black text-blue-700 hover:text-blue-800 hover:underline">
            返回首页
          </Link>
        </p>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="block text-sm font-black text-slate-700">选择录像文件</label>
          <input
            type="file"
            accept=".sc2replay"
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
                <div className="text-sm font-black text-slate-700">玩家信息</div>

                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full table-auto">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs font-black text-slate-600">
                        <th className="px-3 py-2">昵称</th>
                        <th className="px-3 py-2">Handle</th>
                        <th className="px-3 py-2">角色</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.players.map((p) => (
                        <tr key={p.handle} className="border-t border-slate-200 text-sm">
                          <td className="px-3 py-2 font-bold text-slate-800">{p.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">{p.handle}</td>
                          <td className="px-3 py-2 text-slate-700">{p.role}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-700 hover:bg-slate-50"
                              onClick={() => void copy(p.handle)}
                            >
                              复制
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!result.players.length && (
                        <tr className="border-t border-slate-200">
                          <td className="px-3 py-3 text-sm text-slate-500" colSpan={4}>
                            没解析到玩家信息（可能是录像不完整或版本不兼容）
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

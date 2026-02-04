import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as Sentry from "@sentry/react";
import { clearAdminToken, loadAdminToken } from "../lib/adminToken";
import { diffJson } from "../lib/jsonDiff";

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function prettyValue(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v == null) return "null";
  return safeJson(v) || String(v);
}

export default function ConfigEditor(props: { token: string | null; onTokenInvalid?: () => void }) {
  const { logger } = Sentry;
  const token = props.token || loadAdminToken();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [original, setOriginal] = useState<Record<string, unknown> | null>(null);
  const [text, setText] = useState<string>("{}");

  const parsed = useMemo(() => tryParseJson(text), [text]);
  const parsedObj = useMemo(() => (parsed.ok && isPlainObject(parsed.value) ? parsed.value : null), [parsed]);
  const parsedError = useMemo(() => {
    if (!parsed.ok) return parsed.error;
    if (!isPlainObject(parsed.value)) return "配置必须是 JSON 对象（例如：{ \"host\": \"ks.194823.xyz\" }）";
    return null;
  }, [parsed]);

  const diff = useMemo(() => {
    if (!original || !parsedObj) return [];
    return diffJson(original, parsedObj);
  }, [original, parsedObj]);

  const loadConfig = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setOkMsg(null);
    try {
      logger.info("config.load.start");
      const res = await Sentry.startSpan({ op: "http.client", name: "GET /api/config/read" }, async () => {
        return await fetch("/api/config/read", {
          headers: { Accept: "application/json", Authorization: token },
          cache: "no-store",
        });
      });
      if (res.status === 401) {
        clearAdminToken();
        props.onTokenInvalid?.();
        setError("Token 无效或已过期，请重新通过 URL 传入 token。");
        return;
      }
      if (res.status === 404) {
        setOriginal({});
        setText("{}\n");
        setOkMsg("KV 中不存在 secret.json，可直接编辑并保存以创建。");
        logger.info("config.load.not_found");
        return;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${txt}`.trim());
      }

      const json = (await res.json()) as unknown;
      if (!isPlainObject(json)) throw new Error("bad payload");
      setOriginal(json);
      setText(`${safeJson(json)}\n`);
      logger.info("config.load.ok", { fields: Object.keys(json).length });
    } catch (e) {
      Sentry.captureException(e);
      logger.error("config.load.failed", { error: e instanceof Error ? e.message : String(e) });
      setError("读取配置失败。请稍后再试。");
    } finally {
      setLoading(false);
    }
  }, [logger, props, token]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function save() {
    if (!token) return;
    if (!parsedObj) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      logger.info("config.save.start", { diff_count: diff.length });
      const res = await Sentry.startSpan({ op: "http.client", name: "POST /api/config/write" }, async () => {
        return await fetch("/api/config/write", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: token,
          },
          body: JSON.stringify(parsedObj),
        });
      });
      if (res.status === 401) {
        clearAdminToken();
        props.onTokenInvalid?.();
        setError("Token 无效或已过期，请重新通过 URL 传入 token。");
        return;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${txt}`.trim());
      }
      setOriginal(parsedObj);
      setOkMsg("保存成功");
      logger.info("config.save.ok");
      setTimeout(() => setOkMsg(null), 1500);
    } catch (e) {
      Sentry.captureException(e);
      logger.error("config.save.failed", { error: e instanceof Error ? e.message : String(e) });
      setError("保存失败。请稍后再试。");
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-black text-slate-900">配置管理</h1>
          <div className="mt-2 text-sm leading-6 text-slate-700">
            该页面仅对管理员开放。请使用带 token 的 URL 打开一次以缓存：
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700 break-all">
              https://ks.194823.xyz/config?token=YOUR_TOKEN
            </div>
            缓存成功后，本浏览器会自动显示配置管理入口。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-slate-900">配置管理</h1>
            <div className="mt-1 text-sm text-slate-500">
              读/写 KV：<span className="font-black text-slate-700">secret.json</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={() => {
                const p = parsed.ok ? parsed.value : null;
                if (p != null) setText(`${safeJson(p)}\n`);
              }}
              disabled={loading || saving || !parsed.ok}
              title="将当前内容格式化为标准 JSON"
            >
              格式化
            </button>
            <button
              type="button"
              className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={loadConfig}
              disabled={loading || saving}
            >
              重新读取
            </button>
            <button
              type="button"
              className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-black text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
              onClick={save}
              disabled={loading || saving || !!parsedError || !original || diff.length === 0}
              title={diff.length === 0 ? "没有变更" : undefined}
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-500 hover:bg-slate-50"
              onClick={() => {
                clearAdminToken();
                props.onTokenInvalid?.();
              }}
              disabled={loading || saving}
            >
              退出
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-slate-500">加载中...</div>
        ) : error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : okMsg ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {okMsg}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3 px-1 pb-2">
              <div className="text-sm font-black text-slate-900">JSON</div>
              {parsedError ? <div className="text-xs font-bold text-red-600">JSON 无效</div> : null}
            </div>
            <textarea
              className="min-h-[520px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-5 text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-600/10"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            {parsedError ? (
              <div className="mt-2 text-xs leading-5 text-red-700">
                {parsedError}
              </div>
            ) : (
              <div className="mt-2 text-xs leading-5 text-slate-500">
                提示：保存前建议查看右侧「变更预览」。Token 不会写入配置。
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-black text-slate-900">变更预览</div>
              <div className="text-xs font-bold text-slate-500">{diff.length} 项</div>
            </div>

            {!original ? (
              <div className="mt-3 text-sm text-slate-500">请先读取配置。</div>
            ) : parsedError ? (
              <div className="mt-3 text-sm text-slate-500">修复 JSON 后可预览变更。</div>
            ) : diff.length === 0 ? (
              <div className="mt-3 text-sm text-slate-500">暂无变更。</div>
            ) : (
              <div className="mt-3 max-h-[520px] space-y-2 overflow-auto pr-1">
                {diff.map((d) => (
                  <div
                    key={`${d.kind}:${d.path}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono font-black text-slate-900 break-all">{d.path}</div>
                      <span
                        className={[
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black",
                          d.kind === "add"
                            ? "bg-emerald-100 text-emerald-800"
                            : d.kind === "remove"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800",
                        ].join(" ")}
                      >
                        {d.kind === "add" ? "新增" : d.kind === "remove" ? "删除" : "修改"}
                      </span>
                    </div>

                    {d.kind !== "add" ? (
                      <div className="mt-2 rounded-lg bg-white p-2 font-mono text-slate-600 break-words">
                        - {prettyValue(d.before)}
                      </div>
                    ) : null}
                    {d.kind !== "remove" ? (
                      <div className="mt-2 rounded-lg bg-white p-2 font-mono text-slate-700 break-words">
                        + {prettyValue(d.after)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-bold text-slate-500 hover:text-slate-700">
                查看当前 JSON（只读）
              </summary>
              <pre className="mt-2 max-h-[240px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                {parsed.ok ? safeJson(parsed.value) : ""}
              </pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}


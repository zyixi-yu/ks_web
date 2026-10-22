import { useCallback, useEffect, useState } from "react";
import type { MapExport } from "../../worker/services/mapExports";

class SessionExpired extends Error {}

type CodeState = { active: boolean; code?: string; expires_at?: number };

async function read<T>(path: string): Promise<T> {
  const response = await fetch(`/admin/api/${path}`, { cache: "no-store", credentials: "same-origin", redirect: "error" });
  if (response.status === 401 || response.status === 403) throw new SessionExpired("请登录管理后台。");
  if (!response.ok) throw new Error("暂时无法加载，请稍后重试。");
  return response.json();
}

export default function AdminDashboard() {
  const [username, setUsername] = useState("");
  const [loginName, setLoginName] = useState("admin");
  const [password, setPassword] = useState("");
  const [checked, setChecked] = useState(false);
  const [items, setItems] = useState<MapExport[]>([]);
  const [code, setCode] = useState<CodeState>({ active: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [session, maps, verification] = await Promise.all([read<{ username: string }>("session"), read<{ items: MapExport[] }>("maps"), read<CodeState>("verification-code")]);
      setUsername(session.username); setItems(maps.items); setCode(verification);
    } catch (e) { setCode({ active: false }); if (e instanceof SessionExpired) { setUsername(""); setItems([]); } else setError(e instanceof Error ? e.message : "加载失败"); }
    finally { setBusy(false); setChecked(true); }
  }, []);
  useEffect(() => {
    void refresh();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [refresh]);
  useEffect(() => {
    if (!username) return;
    const poll = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
    return () => clearInterval(poll);
  }, [username, refresh]);
  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/admin/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: loginName, password }), credentials: "same-origin" });
      if (!response.ok) throw new Error(response.status === 429 ? "尝试次数过多，请稍后再试。" : "账号或密码不正确，或登录服务暂不可用。");
      setPassword(""); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "登录失败"); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    const response = await fetch("/admin/auth/logout", { method: "POST", credentials: "same-origin" });
    if (!response.ok) { setError("退出失败，请稍后重试。"); return; }
    setUsername(""); setItems([]); setCode({ active: false }); setError("");
  };
  if (!username) return <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900"><main className="w-full max-w-sm rounded-2xl border bg-white p-7 shadow-sm">
    <a href="/" className="text-sm text-cyan-700">← KS 工具箱</a><h1 className="mt-4 text-2xl font-black">管理后台</h1><p className="mt-2 text-sm text-slate-500">登录后查看地图版本与当前游戏验证码。</p>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {checked ? <form onSubmit={event => void login(event)} className="mt-6 space-y-4">
      <label className="block text-sm font-medium">账号<input className="mt-1 block w-full rounded-lg border p-3" value={loginName} onChange={event => setLoginName(event.target.value)} autoComplete="username" required maxLength={32} /></label>
      <label className="block text-sm font-medium">密码<input className="mt-1 block w-full rounded-lg border p-3" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required maxLength={128} /></label>
      <button disabled={busy} className="w-full rounded-lg bg-cyan-700 p-3 font-bold text-white disabled:opacity-40">{busy ? "正在登录…" : "登录"}</button>
    </form> : <p className="mt-6 text-sm text-slate-500">正在检查登录状态…</p>}
  </main></div>;
  const remaining = Math.max(0, (code.expires_at || 0) - Math.floor(now / 1000));
  const date = (value: string) => new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5">
      <div><a href="/" className="text-sm text-cyan-700">← KS 工具箱</a><h1 className="mt-1 text-2xl font-black">管理后台</h1></div>
      <div className="text-right text-sm"><p className="text-slate-600">{username}</p><button className="text-cyan-700 underline" onClick={() => void logout()}>退出登录</button></div>
    </div></header>
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error} <a href="/admin" className="underline">重新加载</a></div>}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">当前游戏验证码</h2><p className="mt-1 text-sm text-slate-500">仅显示有效期内的短信验证码，每 15 秒自动刷新。查看不会清空或延长验证码。</p></div>
          <button disabled={busy} onClick={() => void refresh()} className="shrink-0 rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-40">{busy ? "刷新中" : "刷新"}</button></div>
        {code.active && remaining > 0 ? <div className="mt-5"><p className="font-mono text-4xl font-bold tracking-[0.25em]" aria-label="当前游戏验证码">{code.code}</p><p className="mt-2 text-sm text-slate-500">{remaining} 秒后过期</p></div> : <p className="mt-5 text-slate-500">暂无有效验证码</p>}
      </section>
      <section><h2 className="text-xl font-bold">最近 10 个地图版本</h2><p className="mt-1 text-sm text-slate-500">选择任意版本下载。时间均为北京时间；构建失败不会替换已有可用版本。</p>
        {!items.length && !busy && <div className="mt-4 rounded-xl border bg-white p-6 text-slate-500">尚无可下载版本，首个地图导出完成后会显示在这里。</div>}
        <div className="mt-4 space-y-4">{items.map((item, index) => <article key={item.version} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-bold">{item.map_name} · {item.map_version}{index === 0 && <span className="ml-2 rounded-full bg-cyan-50 px-2 py-1 text-xs text-cyan-800">最新</span>}</h3><p className="mt-1 text-sm text-slate-500">构建于 {date(item.created_at)} · {(item.bytes / 1048576).toFixed(1)} MB</p></div>
            <a href={`/admin/api/maps/${item.version}/download`} className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-800">下载地图</a></div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="inline text-slate-500">翻译合并：</dt><dd className="inline">!{item.mr_iid} · <code>{item.source_sha.slice(0, 12)}</code></dd></div><div><dt className="inline text-slate-500">流水线：</dt><dd className="inline">#{item.pipeline_id}</dd></div><div><dt className="inline text-slate-500">合并时间：</dt><dd className="inline">{date(item.merged_at)}</dd></div><div><dt className="inline text-slate-500">地图编号：</dt><dd className="inline">{item.map_index}</dd></div><div><dt className="inline text-slate-500">构建代码：</dt><dd className="inline font-mono">{item.build_sha.slice(0, 12)}</dd></div><div><dt className="inline text-slate-500">场景素材：</dt><dd className="inline font-mono">{item.maps_sha.slice(0, 12)}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">SHA256</dt><dd className="mt-1 break-all font-mono text-xs text-slate-600">{item.sha256}</dd></div></dl>
        </article>)}</div>
      </section>
    </main>
  </div>;
}

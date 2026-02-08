import { Hono } from "hono";
import { defaultCache } from "../utils/cache";
import { jsonError, jsonOk } from "../utils/http";
import { kvGetJson, kvGetText } from "../services/kv";
import { computeLeaderboard, computePlayerRoles } from "../services/bridge";
import verifyCodeRoutes from "./verify-code";
import i18nRoutes from "./i18n";
import configRoutes from "./config";
import adminRoutes from "./admin";

type HonoEnv = { Bindings: Env };

const api = new Hono<HonoEnv>();

function apiCacheControl(): string {
  return (globalThis as any).__KS_NO_CACHE ? "no-store" : "public, max-age=30";
}

api.route("/verify-code", verifyCodeRoutes);
api.route("/i18n", i18nRoutes);
api.route("/config", configRoutes);
api.route("/admin", adminRoutes);

api.get("/player", async (c) => {
  c.header("X-KS-Mock-KV", (globalThis as any).__KS_NO_CACHE ? "1" : "0");
  const url = new URL(c.req.url);
  const handle = (url.searchParams.get("player_handle") || "").trim();
  if (!handle) return jsonError(c, 400, "Missing player_handle");
  if (handle.length > 64) return jsonError(c, 400, "player_handle too long");

  if (!c.env.KS_KV || typeof (c.env.KS_KV as any).get !== "function") {
    return jsonError(c, 500, "KV binding missing: KS_KV");
  }

  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await defaultCache().match(cacheKey);
  if (cached) return cached;

  const key = "bridge_cn.json";
  const parsed = await kvGetJson(c.env.KS_KV, key);
  if (!parsed) return jsonError(c, 404, `KV key not found: ${key}`);

  let payload: unknown;
  try {
    const computed = computePlayerRoles(parsed, handle);
    if (!computed) return jsonError(c, 404, `Player not found: ${handle}`);
    payload = computed;
  } catch (e) {
    return jsonError(c, 500, (e instanceof Error ? e.message : "") || "bridge_cn.json format error");
  }

  const resp = jsonOk(c, payload, { cacheControl: apiCacheControl() });
  c.executionCtx.waitUntil(defaultCache().put(cacheKey, resp.clone()));
  return resp;
});

api.get("/credits", async (c) => {
  c.header("X-KS-Mock-KV", (globalThis as any).__KS_NO_CACHE ? "1" : "0");
  const url = new URL(c.req.url);
  const handle = (url.searchParams.get("player_handle") || "").trim();
  if (!handle) return jsonError(c, 400, "Missing player_handle");
  if (handle.length > 64) return jsonError(c, 400, "player_handle too long");

  const upstream = new URL("https://credits.replayanalyzer.com/");
  upstream.searchParams.set("player_handle", handle);

  const resp = await fetch(upstream.toString(), {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 30, cacheEverything: true },
  });

  const headers = new Headers(resp.headers);
  headers.set("Cache-Control", "public, max-age=30");
  return new Response(resp.body, { status: resp.status, headers });
});

api.get("/leaderboard", async (c) => {
  c.header("X-KS-Mock-KV", (globalThis as any).__KS_NO_CACHE ? "1" : "0");
  if (!c.env.KS_KV || typeof (c.env.KS_KV as any).get !== "function") {
    return jsonError(c, 500, "KV binding missing: KS_KV");
  }

  const url = new URL(c.req.url);
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await defaultCache().match(cacheKey);
  if (cached) return cached;

  const key = "bridge_cn.json";
  const parsed = await kvGetJson(c.env.KS_KV, key);
  if (!parsed) return jsonError(c, 404, `KV key not found: ${key}`);

  let payload: unknown;
  try {
    payload = computeLeaderboard(parsed);
  } catch (e) {
    return jsonError(c, 500, (e instanceof Error ? e.message : "") || "bridge_cn.json format error");
  }

  const resp = jsonOk(c, payload, { cacheControl: apiCacheControl() });
  c.executionCtx.waitUntil(defaultCache().put(cacheKey, resp.clone()));
  return resp;
});

api.get("/patchnotes", async (c) => {
  c.header("X-KS-Mock-KV", (globalThis as any).__KS_NO_CACHE ? "1" : "0");
  if (!c.env.KS_KV || typeof (c.env.KS_KV as any).get !== "function") {
    return jsonError(c, 500, "KV binding missing: KS_KV");
  }

  const url = new URL(c.req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("page_size") || "20", 10) || 20));

  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await defaultCache().match(cacheKey);
  if (cached) return cached;

  const key = "patchnotes.json";
  const parsed = await kvGetJson(c.env.KS_KV, key);
  if (!parsed || typeof parsed !== "object") return jsonError(c, 404, `KV key not found: ${key}`);

  const all = Object.values(parsed as Record<string, unknown>)
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && typeof (v as any).version === "string")
    .sort((a, b) => {
      const [aMaj, aMin] = (a.version as string).split(".").map(Number);
      const [bMaj, bMin] = (b.version as string).split(".").map(Number);
      return bMaj - aMaj || bMin - aMin;
    });

  const total = all.length;
  const start = (page - 1) * pageSize;
  const items = all.slice(start, start + pageSize);

  const resp = jsonOk(c, { total, page, page_size: pageSize, items }, { cacheControl: apiCacheControl() });
  c.executionCtx.waitUntil(defaultCache().put(cacheKey, resp.clone()));
  return resp;
});

api.post("/replay-upload", async (c) => {
  const MAX = 3 * 1024 * 1024;
  const cl = parseInt(c.req.header("content-length") || "0", 10);
  if (cl > MAX) return jsonError(c, 413, "File too large (max 3 MB)");

  try {
    const upstream = await fetch("https://replay.kerrigansurvival.com/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "User-Agent": "kerrigan-survival-uploader/web",
      },
      body: c.req.raw.body,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") || "text/plain" },
    });
  } catch {
    return jsonError(c, 502, "Upstream request failed");
  }
});

api.get("/proposal_votes_cn.json", async (c) => {
  c.header("X-KS-Mock-KV", (globalThis as any).__KS_NO_CACHE ? "1" : "0");
  if (!c.env.KS_KV || typeof (c.env.KS_KV as any).get !== "function") {
    return jsonError(c, 500, "KV binding missing: KS_KV");
  }

  const key = "proposal_votes_cn.json";
  const body = await kvGetText(c.env.KS_KV, key);
  if (body == null) return jsonError(c, 404, `KV key not found: ${key}`);

  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=60");
  return c.body(body, 200);
});

export default api;

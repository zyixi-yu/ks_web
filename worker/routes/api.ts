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

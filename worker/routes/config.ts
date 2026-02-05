import { Hono } from "hono";
import { kvGetJson } from "../services/kv";
import { requireEnvToken } from "../services/tokenGuard";
import { jsonError, jsonOk } from "../utils/http";

type HonoEnv = { Bindings: Env };

const configRoutes = new Hono<HonoEnv>();

const CONFIG_KV_KEY = "secret.json";
const VERIFY_CODE_KV_KEY = "sms_verify_code_v1";

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

configRoutes.post("/write", async (c) => {
  c.header("X-KS-Mock-KV", (globalThis as any).__KS_NO_CACHE ? "1" : "0");
  const authErr = requireEnvToken(c as any, "VERIFY_CODE_TOKEN");
  if (authErr) return authErr;

  if (!c.env.KS_KV || typeof (c.env.KS_KV as any).put !== "function") {
    return jsonError(c, 500, "KV binding missing: KS_KV");
  }

  let body: unknown;
  try {
    body = (await c.req.json()) as unknown;
  } catch {
    return jsonError(c, 400, "Invalid JSON body");
  }

  const payload = isPlainObject(body) && "config" in body ? (body as any).config : body;
  if (!isPlainObject(payload)) return jsonError(c, 400, "Missing config object");

  const value = JSON.stringify(payload);
  await c.env.KS_KV.put(CONFIG_KV_KEY, value);

  console.info("config.write.ok", { key: CONFIG_KV_KEY, bytes: value.length, fields: Object.keys(payload).length });
  return jsonOk(
    c,
    { ok: true, key: CONFIG_KV_KEY, updated_at: Math.floor(Date.now() / 1000) },
    { cacheControl: "no-store" },
  );
});

configRoutes.get("/read", async (c) => {
  c.header("X-KS-Mock-KV", (globalThis as any).__KS_NO_CACHE ? "1" : "0");
  const authErr = requireEnvToken(c as any, "VERIFY_CODE_TOKEN");
  if (authErr) return authErr;

  if (!c.env.KS_KV || typeof (c.env.KS_KV as any).get !== "function") {
    return jsonError(c, 500, "KV binding missing: KS_KV");
  }

  // When config is requested, clear the active SMS verification code (if any).
  // KV TTL already handles expiration; deleting is idempotent.
  try {
    if (typeof (c.env.KS_KV as any).delete === "function") {
      await (c.env.KS_KV as any).delete(VERIFY_CODE_KV_KEY);
      console.info("verify_code.cleared_by_config_read", { key: VERIFY_CODE_KV_KEY });
    }
  } catch (e) {
    console.warn("verify_code.clear_failed_by_config_read", e);
  }

  let raw: unknown;
  try {
    raw = await kvGetJson(c.env.KS_KV, CONFIG_KV_KEY);
  } catch (e) {
    return jsonError(c, 500, (e instanceof Error ? e.message : "") || "KV config parse error");
  }
  if (!raw) return jsonError(c, 404, "Config not found");
  if (!isPlainObject(raw)) return jsonError(c, 500, "Config format error");

  console.info("config.read.ok", { key: CONFIG_KV_KEY, fields: Object.keys(raw).length });
  return jsonOk(c, raw, { cacheControl: "no-store" });
});

export default configRoutes;

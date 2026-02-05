import { Hono } from "hono";
import { kvGetText } from "../services/kv";
import { requireEnvToken } from "../services/tokenGuard";
import { jsonError } from "../utils/http";

type HonoEnv = { Bindings: Env };

const adminRoutes = new Hono<HonoEnv>();

adminRoutes.get("/bridge_cn.json", async (c) => {
  c.header("X-KS-Mock-KV", (globalThis as any).__KS_NO_CACHE ? "1" : "0");
  const authErr = requireEnvToken(c as any, "VERIFY_CODE_TOKEN");
  if (authErr) return authErr;

  if (!c.env.KS_KV || typeof (c.env.KS_KV as any).get !== "function") {
    return jsonError(c, 500, "KV binding missing: KS_KV");
  }

  const key = "bridge_cn.json";
  const body = await kvGetText(c.env.KS_KV, key);
  if (body == null) return jsonError(c, 404, `KV key not found: ${key}`);

  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="bridge_cn.json"');
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");

  console.info("admin.bridge_cn.download.ok", { key, bytes: body.length });
  return c.body(body, 200);
});

export default adminRoutes;


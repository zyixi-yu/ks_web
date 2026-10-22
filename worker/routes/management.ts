import { Hono } from "hono";
import { catalog } from "../services/mapExports";

import { driveDownload } from "../services/driveStorage";

const management = new Hono<{ Bindings: Env; Variables: { adminUsername: string } }>();

management.get("/session", c => c.json({ username: c.get("adminUsername") }));
management.get("/maps", async c => c.json({ items: await catalog(c.env) }));
management.get("/maps/:version/download", async c => {
  const entry = (await catalog(c.env)).find(x => x.version === c.req.param("version"));
  if (!entry) return c.json({ error: "Version not available" }, 404);
  try { return await driveDownload(c.env, entry); }
  catch { return c.json({ error: "Map storage temporarily unavailable" }, 502); }
});

management.get("/verification-code", async c => {
  const value = await c.env.KS_KV.get("sms_verify_code_v1", "json") as { code?: unknown; created_at?: unknown } | null;
  const now = Math.floor(Date.now() / 1000);
  if (!value || typeof value.code !== "string" || !/^\d{6}$/.test(value.code) || typeof value.created_at !== "number" || value.created_at > now || value.created_at + 180 <= now) {
    return c.json({ active: false });
  }
  return c.json({ active: true, code: value.code, created_at: value.created_at, expires_at: value.created_at + 180 });
});

export default management;

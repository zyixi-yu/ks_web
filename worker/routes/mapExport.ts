import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { constantTimeEqual, parseBearerToken } from "../services/auth";
import { catalog, EXPORT_CATALOG_KEY, MAP_FILE, packageFetch, parseExport, updatedCatalog } from "../services/mapExports";

const routes = new Hono<{ Bindings: Env }>();
routes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  const token = parseBearerToken(c.req.header("Authorization") || null);
  if (!c.env.MAP_EXPORT_TOKEN || !token || !constantTimeEqual(token, c.env.MAP_EXPORT_TOKEN)) return c.json({ error: "Unauthorized" }, 401);
  await next();
});

// Machine-only, allowlisted build inputs. Does not read, clear, or extend the SMS code.
routes.get("/inputs", async c => {
  const secret = await c.env.KS_KV.get("secret.json", "json") as Record<string, unknown> | null;
  if (!secret) return c.json({ error: "Build configuration unavailable" }, 503);
  const keys = ["lark_app_id", "lark_app_secret", "lark_app secret", "force_rock_pct", "force_win_rate", "screen_msg", "blacklist_handles"];
  return c.json(Object.fromEntries(keys.filter(k => secret[k] !== undefined).map(k => [k, secret[k]])));
});
routes.get("/bridge", async c => {
  const body = await c.env.KS_KV.get("bridge_cn.json");
  if (!body) return c.json({ error: "Bridge unavailable" }, 503);
  return c.body(body, 200, { "Content-Type": "application/json" });
});
routes.post("/complete", bodyLimit({ maxSize: 16384, onError: c => c.json({ error: "Request too large" }, 413) }), async c => {
  if (Number(c.req.header("Content-Length") || 0) > 16384) return c.json({ error: "Request too large" }, 413);
  let entry;
  try { entry = parseExport(await c.req.json()); } catch { return c.json({ error: "Invalid manifest" }, 400); }
  const response = await packageFetch(c.env, entry.version, "manifest.json");
  if (!response.ok) return c.json({ error: "Uploaded manifest unavailable" }, 502);
  let stored;
  try { stored = parseExport(await response.json()); } catch { return c.json({ error: "Uploaded manifest invalid" }, 502); }
  if (JSON.stringify(entry) !== JSON.stringify(stored)) return c.json({ error: "Manifest mismatch" }, 409);
  const file = await packageFetch(c.env, entry.version, MAP_FILE, "HEAD");
  if (!file.ok || Number(file.headers.get("Content-Length")) !== entry.bytes) return c.json({ error: "Uploaded file unavailable" }, 502);
  await c.env.KS_KV.put(EXPORT_CATALOG_KEY, JSON.stringify(updatedCatalog(await catalog(c.env), entry)));
  return c.json({ ok: true, version: entry.version });
});
export default routes;

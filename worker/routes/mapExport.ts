import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { constantTimeEqual, parseBearerToken } from "../services/auth";
import { catalog, EXPORT_CATALOG_KEY, parseExport, updatedCatalog } from "../services/mapExports";

import { beginDriveUpload, driveDownload, verifiedDriveEntry } from "../services/driveStorage";

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
const smallBody = bodyLimit({ maxSize: 16384, onError: c => c.json({ error: "Request too large" }, 413) });
routes.post("/upload", smallBody, async c => {
  let entry;
  try { entry = parseExport(await c.req.json()); } catch { return c.json({ error: "Invalid manifest" }, 400); }
  try { return c.json({ upload_url: await beginDriveUpload(c.env, entry) }); }
  catch { return c.json({ error: "Drive upload unavailable" }, 502); }
});
routes.get("/objects/:id", async c => {
  try { return await driveDownload(c.env, await verifiedDriveEntry(c.env, c.req.param("id"))); }
  catch { return c.json({ error: "Uploaded map unavailable" }, 502); }
});
routes.post("/complete", smallBody, async c => {
  let entry;
  try { entry = parseExport(await c.req.json()); } catch { return c.json({ error: "Invalid manifest" }, 400); }
  if (!entry.drive_file_id) return c.json({ error: "Drive file ID is required" }, 400);
  let stored;
  try { stored = await verifiedDriveEntry(c.env, entry.drive_file_id); }
  catch { return c.json({ error: "Uploaded file unavailable or invalid" }, 502); }
  if (JSON.stringify(entry) !== JSON.stringify(stored)) return c.json({ error: "Manifest mismatch" }, 409);
  await c.env.KS_KV.put(EXPORT_CATALOG_KEY, JSON.stringify(updatedCatalog(await catalog(c.env), entry)));
  return c.json({ ok: true, version: entry.version });
});
export default routes;

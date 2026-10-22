import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import { passwordDigest } from "../services/adminAuth";
import app from "../app";
import { EXPORT_CATALOG_KEY, parseExport, updatedCatalog } from "../services/mapExports";

const password = "p".repeat(43);
const account = { username: "admin", salt: "a".repeat(32), hash: await passwordDigest("a".repeat(32), password), version: "b".repeat(32) };
const sessionSecret = "s".repeat(43);
const token = (overrides: Record<string, unknown> = {}) => new SignJWT({ version: account.version, ...overrides })
  .setProtectedHeader({ alg: "HS256" }).setIssuer("ks-admin").setAudience("ks-admin").setSubject("admin").setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(sessionSecret));
let rateAllowed = true;
const values = new Map<string, unknown>();
let writes: string[] = [];
const env = {
  ADMIN_ACCOUNTS: JSON.stringify([account]), ADMIN_SESSION_SECRET: sessionSecret,
  ADMIN_LOGIN_LIMIT: { limit: async () => ({ success: rateAllowed }) },
  VERIFY_CODE_TOKEN: "super-secret", MAP_EXPORT_TOKEN: "build-secret", MAP_PACKAGE_READ_TOKEN: "read-secret",
  ASSETS: { fetch: async () => new Response("Admin page") },
  KS_KV: {
    get: async (key: string, type?: string) => type === "json" ? values.get(key) ?? null : values.has(key) ? JSON.stringify(values.get(key)) : null,
    put: async (key: string, value: string) => { writes.push(key); values.set(key, JSON.parse(value)); },
    delete: async () => { throw new Error("These routes must never clear codes or configuration"); },
  },
} as unknown as Env;
const entry = (n = 1) => parseExport({ version: `${"a".repeat(40)}-${n}`, source_sha: "a".repeat(40), build_sha: "b".repeat(40), maps_sha: "c".repeat(40), bridge_sha256: "d".repeat(64), sha256: "e".repeat(64), bytes: 4096, map_version: "2.830", map_name: "凯瑞甘生存2", map_index: 0, mr_iid: 5935, pipeline_id: n, created_at: "2026-10-22T12:00:00Z", merged_at: "2026-10-22T10:00:00Z" });
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected upstream"); };
const request = async (path: string, jwt?: string, init: RequestInit = {}) => app.request(`https://ks.194823.xyz${path}`, { ...init, headers: { ...(jwt ? { Cookie: `__Host-KS_ADMIN=${jwt}` } : {}), ...init.headers } }, env);
const login = (username: string, supplied = password, origin = "https://ks.194823.xyz") => request("/admin/auth/login", undefined, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username, password: supplied }) });

test("login shell is public; APIs and files reject anonymous and forged identities", async () => {
  assert.equal((await request("/admin")).status, 200);
  for (const path of ["/admin/api/maps", "/admin/api/verification-code", `/admin/api/maps/${entry().version}/download`]) {
    assert.equal((await request(path, undefined, { headers: { "Cf-Access-Authenticated-User-Email": "admin@example.com" } })).status, 401);
  }
  assert.equal((await request("/admin/api/session", "forged.jwt.value")).status, 401);
});
test("fixed account signs in with secure cookie; invalid accounts and passwords fail", async () => {
  const response = await login("admin");
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie") || "";
  assert.match(cookie, /__Host-KS_ADMIN=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Path=\//);
  const session = await request("/admin/api/session", cookie.split(";")[0].split("=")[1]);
  assert.deepEqual(await session.json(), { username: "admin" });
  assert.equal(session.headers.get("cache-control"), "private, no-store");
  assert.equal((await login("other")).status, 401);
  assert.equal((await login("admin", "x".repeat(43))).status, 401);
  assert.equal((await request("/admin/api/session", await token({ version: "revoked" }))).status, 401);
  const expired = await new SignJWT({ version: account.version }).setProtectedHeader({ alg: "HS256" }).setIssuer("ks-admin").setAudience("ks-admin").setSubject("admin").setIssuedAt(1).setExpirationTime(2).sign(new TextEncoder().encode(sessionSecret));
  assert.equal((await request("/admin/api/session", expired)).status, 401);
});
test("cross-site login/logout, oversized payloads, and excess attempts are rejected", async () => {
  assert.equal((await login("admin", password, "https://attacker.example")).status, 403);
  assert.equal((await request("/admin/auth/logout", undefined, { method: "POST" })).status, 403);
  const large = await request("/admin/auth/login", undefined, { method: "POST", headers: { Origin: "https://ks.194823.xyz", "Content-Type": "application/json" }, body: "x".repeat(2048) });
  assert.equal(large.status, 413);
  rateAllowed = false;
  assert.equal((await login("admin")).status, 429);
  rateAllowed = true;
  const logout = await request("/admin/auth/logout", await token(), { method: "POST", headers: { Origin: "https://ks.194823.xyz" } });
  assert.equal(logout.status, 200); assert.match(logout.headers.get("set-cookie") || "", /Max-Age=0/);
});
test("administrator is not a super-admin or an export machine", async () => {
  const jwt = await token();
  assert.equal((await request("/api/config/read", jwt)).status, 401);
  assert.equal((await request("/api/config/write", jwt, { method: "POST", body: "{}" })).status, 401);
  assert.equal((await request("/api/map-export/inputs", jwt)).status, 401);
});
test("viewing a current SMS code is read-only and expires using its original timestamp", async () => {
  writes = [];
  values.set("sms_verify_code_v1", { code: "123456", created_at: Math.floor(Date.now() / 1000) - 10 });
  const response = await request("/admin/api/verification-code", await token());
  const data = await response.json() as { active: boolean; code?: string };
  assert.equal(data.active, true); assert.equal(data.code, "123456"); assert.deepEqual(writes, []);
  values.set("sms_verify_code_v1", { code: "123456", created_at: Math.floor(Date.now() / 1000) - 181 });
  assert.deepEqual(await (await request("/admin/api/verification-code", await token())).json(), { active: false });
});
test("catalogue retains the latest ten ordered versions; older completion cannot replace latest", () => {
  let items = [] as ReturnType<typeof entry>[];
  for (let i = 1; i <= 12; i++) items = updatedCatalog(items, entry(i));
  assert.equal(items.length, 10); assert.equal(items[0].pipeline_id, 12);
  items = updatedCatalog(items, { ...entry(13), merged_at: "2025-10-22T10:00:00Z" });
  assert.equal(items[0].pipeline_id, 12); assert.equal(items.length, 10);
});
test("scheduled versions have a distinct source label and remain in the latest ten", () => {
  const scheduled = parseExport({ ...entry(3), export_kind: "scheduled", mr_iid: 0, merged_at: "2026-10-23T22:00:00Z" });
  assert.equal(scheduled.export_kind, "scheduled");
  assert.equal(updatedCatalog([entry(1)], scheduled)[0].version, scheduled.version);
  assert.throws(() => parseExport({ ...scheduled, export_kind: "translation_merge" }));
});
test("failed private storage validation preserves existing catalogue", async () => {
  values.set(EXPORT_CATALOG_KEY, [entry()]); writes = [];
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  const response = await request("/api/map-export/complete", undefined, { method: "POST", headers: { Authorization: "Bearer build-secret", "Content-Type": "application/json" }, body: JSON.stringify(entry(2)) });
  assert.equal(response.status, 502); assert.deepEqual(writes, []);
});
test("any listed version downloads through authenticated streaming without leaking storage token", async () => {
  values.set(EXPORT_CATALOG_KEY, [entry(2), entry(1)]);
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/cn-map-export\/[a-f0-9]{40}-1\/KerriganSurvival2_CN.SC2Map$/);
    assert.equal(new Headers(init?.headers).get("DEPLOY-TOKEN"), "read-secret");
    assert.equal(new Headers(init?.headers).get("User-Agent"), "KS2-MapExport/1.0");
    assert.equal(init?.redirect, "manual");
    return new Response(new Uint8Array(4096), { headers: { "Content-Length": "4096" } });
  };
  const response = await request(`/admin/api/maps/${entry(1).version}/download`, await token());
  assert.equal(response.status, 200); assert.equal((await response.arrayBuffer()).byteLength, 4096);
  assert.equal(response.headers.get("deploy-token"), null);
  assert.equal((await request("/admin/api/maps/not-listed/download", await token())).status, 404);
  globalThis.fetch = realFetch;
});
test("private storage redirects are rejected without forwarding its credential", async () => {
  values.set(EXPORT_CATALOG_KEY, [entry()]); writes = [];
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests++;
    assert.equal(init?.redirect, "manual");
    return new Response(null, { status: 302, headers: { Location: "https://untrusted.example/map" } });
  };
  const response = await request(`/admin/api/maps/${entry().version}/download`, await token());
  assert.equal(response.status, 502);
  assert.equal(requests, 1);
  const complete = await request("/api/map-export/complete", undefined, { method: "POST", headers: { Authorization: "Bearer build-secret", "Content-Type": "application/json" }, body: JSON.stringify(entry()) });
  assert.equal(complete.status, 502);
  assert.deepEqual(writes, []);
  globalThis.fetch = realFetch;
});

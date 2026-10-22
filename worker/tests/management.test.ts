import assert from "node:assert/strict";
import { test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import app from "../app";
import { EXPORT_CATALOG_KEY, parseExport, updatedCatalog } from "../services/mapExports";

const issuer = "https://ks-test.cloudflareaccess.com";
const { publicKey, privateKey } = await generateKeyPair("RS256");
const key = { ...await exportJWK(publicKey), kid: "ks-test", alg: "RS256", use: "sig" };
const token = (overrides: Record<string, unknown> = {}) => new SignJWT({ email: "admin@example.com", ...overrides })
  .setProtectedHeader({ alg: "RS256", kid: "ks-test" }).setIssuer(issuer).setAudience("admin-aud").setSubject("admin-id").setIssuedAt().setExpirationTime("1h").sign(privateKey);
const values = new Map<string, unknown>();
let writes: string[] = [];
const env = {
  ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: "admin-aud", ADMIN_EMAILS: "admin@example.com",
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
globalThis.fetch = async (input, init) => {
  if (String(input).endsWith("/cdn-cgi/access/certs")) return Response.json({ keys: [key] });
  throw new Error("Unexpected upstream");
};
const request = async (path: string, jwt?: string, init: RequestInit = {}) => app.request(`https://ks.194823.xyz${path}`, { ...init, headers: { ...(jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {}), ...init.headers } }, env);

test("anonymous and forged identity headers cannot access page, APIs, or files", async () => {
  for (const path of ["/admin", "/admin/api/maps", "/admin/api/verification-code", `/admin/api/maps/${entry().version}/download`]) {
    assert.equal((await request(path, undefined, { headers: { "Cf-Access-Authenticated-User-Email": "admin@example.com" } })).status, 401);
  }
  assert.equal((await request("/admin/api/session", "forged.jwt.value")).status, 403);
});
test("verified exact email may sign in; another email or audience may not", async () => {
  const response = await request("/admin/api/session", await token());
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { email: string }).email, "admin@example.com");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await request("/admin/api/session", await token({ email: "other@example.com" }))).status, 403);
  const wrongAud = await new SignJWT({ email: "admin@example.com" }).setProtectedHeader({ alg: "RS256", kid: "ks-test" }).setIssuer(issuer).setAudience("other-app").setSubject("admin-id").setIssuedAt().setExpirationTime("1h").sign(privateKey);
  assert.equal((await request("/admin/api/session", wrongAud)).status, 403);
  const expired = await new SignJWT({ email: "admin@example.com" }).setProtectedHeader({ alg: "RS256", kid: "ks-test" }).setIssuer(issuer).setAudience("admin-aud").setSubject("admin-id").setIssuedAt(1).setExpirationTime(2).sign(privateKey);
  assert.equal((await request("/admin/api/session", expired)).status, 403);
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
    assert.equal(init?.redirect, "error");
    return new Response(new Uint8Array(4096), { headers: { "Content-Length": "4096" } });
  };
  const response = await request(`/admin/api/maps/${entry(1).version}/download`, await token());
  assert.equal(response.status, 200); assert.equal((await response.arrayBuffer()).byteLength, 4096);
  assert.equal(response.headers.get("deploy-token"), null);
  assert.equal((await request("/admin/api/maps/not-listed/download", await token())).status, 404);
  globalThis.fetch = realFetch;
});

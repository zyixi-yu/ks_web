import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import { passwordDigest } from "../services/adminAuth";
import app from "../app";
import { EXPORT_CATALOG_KEY, parseExport, updatedCatalog } from "../services/mapExports";

// Node has no Workers native stream; route tests use its size/error contract.
// The native implementation is additionally exercised in workerd and live downloads.
(globalThis as any).FixedLengthStream = class extends TransformStream<Uint8Array, Uint8Array> {
  constructor(expected: number) {
    let received = 0;
    super({ transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > expected) throw new Error("too many bytes");
      controller.enqueue(chunk);
    }, flush() { if (received !== expected) throw new Error("too few bytes"); } });
  }
};

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
  VERIFY_CODE_TOKEN: "super-secret", MAP_EXPORT_TOKEN: "build-secret", DRIVE_CLIENT_ID: "client-id", DRIVE_CLIENT_SECRET: "client-secret", DRIVE_REFRESH_TOKEN: "refresh-secret", DRIVE_FOLDER_ID: "map-folder-12345",
  ASSETS: { fetch: async () => new Response("Admin page") },
  KS_KV: {
    get: async (key: string, type?: string) => type === "json" ? values.get(key) ?? null : values.has(key) ? JSON.stringify(values.get(key)) : null,
    put: async (key: string, value: string) => { writes.push(key); values.set(key, JSON.parse(value)); },
    delete: async () => { throw new Error("These routes must never clear codes or configuration"); },
  },
} as unknown as Env;
const entry = (n = 1) => parseExport({ drive_file_id: `drive-file-${n}-12345`, version: `${"a".repeat(40)}-${n}`, source_sha: "a".repeat(40), build_sha: "b".repeat(40), maps_sha: "c".repeat(40), bridge_sha256: "d".repeat(64), sha256: "e".repeat(64), bytes: 4096, map_version: "2.830", map_name: "凯瑞甘生存2", map_index: 0, mr_iid: 5935, pipeline_id: n, created_at: "2026-10-22T12:00:00Z", merged_at: "2026-10-22T10:00:00Z" });
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
function driveMetadata(item = entry()) {
  const { drive_file_id, ...manifest } = item;
  return { id: drive_file_id, name: `${item.version}.SC2Map`, size: String(item.bytes), sha256Checksum: item.sha256,
    mimeType: "application/octet-stream", description: JSON.stringify(manifest), parents: [env.DRIVE_FOLDER_ID],
    appProperties: { ks2_export: "1", version: item.version }, trashed: false };
}
function driveMock(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.redirect, "manual");
    if (String(url) === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "drive-access", expires_in: 3600 });
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer drive-access");
    assert.equal(new URL(String(url)).origin, "https://www.googleapis.com");
    return handler(String(url), init);
  };
}
const machine = { Authorization: "Bearer build-secret", "Content-Type": "application/json" };

test("any listed Drive version streams only after folder and integrity validation", async () => {
  values.set(EXPORT_CATALOG_KEY, [entry(2), entry(1)]);
  driveMock(url => url.includes("alt=media")
    ? new Response(new Uint8Array(4096), { headers: { "Content-Length": "4096", "Authorization": "private-upstream" } })
    : Response.json(driveMetadata()));
  const response = await request(`/admin/api/maps/${entry().version}/download`, await token());
  assert.equal(response.status, 200); assert.equal((await response.arrayBuffer()).byteLength, 4096);
  assert.equal(response.headers.get("authorization"), null);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await request("/admin/api/maps/not-listed/download", await token())).status, 404);
});
test("chunked Drive download validates actual size and requests identity encoding", async () => {
  values.set(EXPORT_CATALOG_KEY, [entry()]);
  for (const size of [4096, 4095, 4097]) {
    driveMock((url, init) => {
      if (!url.includes("alt=media")) return Response.json(driveMetadata());
      assert.equal(new Headers(init?.headers).get("Accept-Encoding"), "identity");
      return new Response(new Uint8Array(size));
    });
    const result = await request(`/admin/api/maps/${entry().version}/download`, await token());
    assert.equal(result.status, 200);
    if (size === 4096) assert.equal((await result.arrayBuffer()).byteLength, size);
    else await assert.rejects(result.arrayBuffer());
  }
  driveMock(url => url.includes("alt=media")
    ? new Response(new Uint8Array(4096), { headers: { "Content-Encoding": "gzip" } })
    : Response.json(driveMetadata()));
  assert.equal((await request(`/admin/api/maps/${entry().version}/download`, await token())).status, 502);
});
test("Drive completion rejects corrupt, moved, trashed and substituted files without changing latest", async () => {
  for (const change of [{ sha256Checksum: "f".repeat(64) }, { size: "3" }, { parents: ["other-folder"] },
    { trashed: true }, { name: "another-file" }, { id: "another-file-id" }, { appProperties: {} }]) {
    writes = [];
    driveMock(() => Response.json({ ...driveMetadata(), ...change }));
    const result = await request("/api/map-export/complete", undefined, { method: "POST", headers: machine, body: JSON.stringify(entry()) });
    assert.equal(result.status, 502); assert.deepEqual(writes, []);
  }
  driveMock(() => Response.json(driveMetadata()));
  const mismatch = await request("/api/map-export/complete", undefined, { method: "POST", headers: machine, body: JSON.stringify({ ...entry(), map_version: "wrong" }) });
  assert.equal(mismatch.status, 409);
});
test("verified Drive completion registers a downloadable version", async () => {
  driveMock(() => Response.json(driveMetadata()));
  const result = await request("/api/map-export/complete", undefined, { method: "POST", headers: machine, body: JSON.stringify(entry()) });
  assert.equal(result.status, 200);
  assert.equal((values.get(EXPORT_CATALOG_KEY) as any[]).find(x => x.version === entry().version).drive_file_id, entry().drive_file_id);
});
test("upload creates only an app-owned private map and returns a scoped session to the machine", async () => {
  assert.equal((await request("/api/map-export/upload", await token(), { method: "POST", body: JSON.stringify(entry()) })).status, 401);
  driveMock((url, init) => {
    assert.match(url, /uploadType=resumable/);
    const data = JSON.parse(String(init?.body));
    assert.deepEqual(data.parents, [env.DRIVE_FOLDER_ID]);
    assert.equal(data.permissions, undefined);
    assert.equal(JSON.parse(data.description).drive_file_id, undefined);
    return new Response(null, { headers: { Location: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=temporary" } });
  });
  const result = await request("/api/map-export/upload", undefined, { method: "POST", headers: machine, body: JSON.stringify(entry()) });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
});
test("redirects and unexpected upload locations never receive credentials", async () => {
  values.set(EXPORT_CATALOG_KEY, [entry()]); writes = [];
  let requests = 0;
  driveMock(() => { requests++; return new Response(null, { status: 302, headers: { Location: "https://untrusted.example/map" } }); });
  assert.equal((await request(`/admin/api/maps/${entry().version}/download`, await token())).status, 502);
  assert.equal(requests, 1);
  driveMock(() => new Response(null, { headers: { Location: "https://untrusted.example/upload" } }));
  assert.equal((await request("/api/map-export/upload", undefined, { method: "POST", headers: machine, body: JSON.stringify(entry()) })).status, 502);
  assert.deepEqual(writes, []);
});
test("machine readback rejects anonymous access and unrelated Drive files", async () => {
  assert.equal((await request(`/api/map-export/objects/${entry().drive_file_id}`)).status, 401);
  driveMock(() => Response.json({ ...driveMetadata(), parents: ["unrelated-folder"] }));
  assert.equal((await request(`/api/map-export/objects/${entry().drive_file_id}`, undefined, { headers: machine })).status, 502);
  globalThis.fetch = realFetch;
});

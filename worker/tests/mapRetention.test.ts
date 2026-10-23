import assert from "node:assert/strict";
import { after, test } from "node:test";
import app from "../app";
import worker from "../index";
import { cleanupMaps, ExpiredMapUpload, registerDriveMap } from "../services/mapRetention";
import { EXPORT_CATALOG_KEY, parseExport } from "../services/mapExports";

const HOUR = 3600000;
const now = Date.now();
const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString();
const entry = (n: number) => parseExport({ drive_file_id: `drive-file-${n}-12345`, version: `${"a".repeat(40)}-${n}`,
  source_sha: "a".repeat(40), build_sha: "b".repeat(40), maps_sha: "c".repeat(40), bridge_sha256: "d".repeat(64), sha256: "e".repeat(64),
  bytes: 4096, map_version: "2.830", map_name: "KS2", map_index: 0, mr_iid: 5935, pipeline_id: n,
  created_at: at(1000), merged_at: at(1000) });
const file = (n: number, registered = true, age = 72) => {
  const { drive_file_id, ...manifest } = entry(n);
  return { id: drive_file_id!, name: `${manifest.version}.SC2Map`, description: JSON.stringify(manifest),
    size: "4096", sha256Checksum: manifest.sha256, mimeType: "application/octet-stream", parents: ["map-folder-12345"],
    appProperties: { ks2_export: "1", version: manifest.version, ...(registered ? { ks2_registered_at: at(age) } : {}) } as Record<string, string>,
    createdTime: at(age), modifiedTime: at(age), trashed: false, ownedByMe: true };
};
const realFetch = globalThis.fetch;
after(() => { globalThis.fetch = realFetch; });
function fixture(files = Array.from({ length: 12 }, (_, i) => file(i + 1)), listed = Array.from({ length: 10 }, (_, i) => entry(12 - i))) {
  let catalogue = listed;
  let pages = [files];
  let incomplete = false;
  const deletes: string[] = [], patches: string[] = [], writes: string[] = [];
  let beforeRead = (_id: string) => {};
  let failDelete = "";
  let listCalls = 0;
  const env = { DRIVE_FOLDER_ID: "map-folder-12345", DRIVE_CLIENT_ID: "client", DRIVE_CLIENT_SECRET: "secret",
    DRIVE_REFRESH_TOKEN: "refresh", MAP_RETENTION_ENABLED: "true", MAP_EXPORT_TOKEN: "machine",
    KS_KV: { get: async (key: string) => { assert.equal(key, EXPORT_CATALOG_KEY); return catalogue; },
      put: async (key: string, value: string) => { writes.push(key); catalogue = JSON.parse(value); } } } as unknown as Env;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.redirect, "manual");
    if (url.origin === "https://oauth2.googleapis.com") return Response.json({ access_token: "access", expires_in: 3600 });
    assert.equal(url.origin, "https://www.googleapis.com");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer access");
    if (url.pathname === "/drive/v3/files") {
      assert.match(url.searchParams.get("q")!, /'map-folder-12345' in parents/);
      assert.match(url.searchParams.get("q")!, /appProperties has/);
      assert.equal(url.searchParams.get("spaces"), "drive");
      assert.equal(url.searchParams.get("corpora"), "user");
      listCalls++;
      const p = Number(url.searchParams.get("pageToken") || 0);
      return Response.json({ files: pages[p], incompleteSearch: incomplete, ...(p + 1 < pages.length ? { nextPageToken: String(p + 1) } : {}) });
    }
    const id = url.pathname.split("/").at(-1)!;
    if (init?.method === "DELETE") {
      if (id === failDelete) return new Response(null, { status: 503 });
      deletes.push(id);
      const index = files.findIndex(x => x.id === id);
      if (index < 0) return new Response(null, { status: 404 });
      files.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    beforeRead(id);
    const item = files.find(x => x.id === id);
    if (!item) return new Response(null, { status: 404 });
    if (init?.method === "PATCH") {
      patches.push(id);
      Object.assign(item.appProperties, JSON.parse(String(init.body)).appProperties);
    }
    return Response.json(item);
  };
  return { env, files, deletes, patches, writes, setPages: (value: typeof pages) => { pages = value; },
    setIncomplete: () => { incomplete = true; }, setCatalogue: (value: typeof listed) => { catalogue = value; },
    onRead: (value: typeof beforeRead) => { beforeRead = value; }, fail: (id: string) => { failDelete = id; }, calls: () => listCalls };
}

test("keeps the ten newest registered versions, deletes older files, and is idempotent", async () => {
  const f = fixture();
  const result = await cleanupMaps(f.env);
  assert.equal(result.protected, 10); assert.equal(result.eligible, 2);
  assert.deepEqual(f.deletes.sort(), [file(1).id, file(2).id]);
  assert.equal((await cleanupMaps(f.env)).deleted.length, 0);
  assert.deepEqual(f.writes, []);
});
test("abandoned uploads use Drive creation AND modification age, not manifest dates", async () => {
  const files = [file(10), file(1, false, 49), file(2, false, 47), { ...file(3, false, 72), modifiedTime: at(1) }, file(4, false, -1)];
  const f = fixture(files, [entry(10)]);
  const r = await cleanupMaps(f.env);
  assert.deepEqual(f.deletes, [file(1).id]);
  assert.equal(r.candidates[0].reason, "abandoned_upload");
});
test("stale KV cannot erase new registrations; current catalogue and fresh registrations are protected", async () => {
  const f = fixture([...Array.from({ length: 12 }, (_, i) => file(i + 2)), file(1, true, 0.2)], [entry(2)]);
  await cleanupMaps(f.env);
  assert.deepEqual(f.deletes, [file(3).id]); // Drive protects 4..13; stale KV protects 2; grace protects 1.
});
test("never deletes other folders, owners, files, malformed markers, changed valid objects or any protected version duplicate", async () => {
  const variants = [
    { ...file(1, false), parents: ["other-folder"] }, { ...file(2, false), ownedByMe: false },
    { ...file(3, false), appProperties: {} }, { ...file(4, false), name: "unrelated.txt" },
    { ...file(5, false), description: "invalid" }, { ...file(6, false), mimeType: "application/vnd.google-apps.folder" },
    { ...file(7, false), trashed: true }, { ...file(8, false), createdTime: "unknown" },
    { ...file(9), sha256Checksum: "changed" },
    { ...file(20), appProperties: { ...file(20).appProperties, ks2_registered_at: "invalid" } },
    { ...file(30, false), id: "duplicate-file-12345" }, file(30),
  ];
  const f = fixture(variants, [entry(30)]);
  assert.equal((await cleanupMaps(f.env)).eligible, 0);
  assert.deepEqual(f.deletes, []);
});
test("complete pagination precedes deletion; incomplete searches and oversized inventories delete nothing", async () => {
  const f = fixture();
  f.setPages([f.files.slice(0, 2), [], f.files.slice(2)]);
  await cleanupMaps(f.env); assert.equal(f.calls(), 3); assert.equal(f.deletes.length, 2);
  for (const mode of ["incomplete", "limit"]) {
    const g = fixture();
    if (mode === "incomplete") g.setIncomplete();
    else g.setPages(Array.from({ length: 6 }, () => []));
    await assert.rejects(cleanupMaps(g.env)); assert.deepEqual(g.deletes, []);
  }
});
test("missing/corrupt catalogue or listed storage fails closed", async () => {
  for (const mode of ["empty", "missing", "corrupt"]) {
    const f = fixture();
    if (mode === "empty") f.setCatalogue([]);
    if (mode === "missing") f.files.pop();
    if (mode === "corrupt") f.files.at(-1)!.sha256Checksum = "bad";
    await assert.rejects(cleanupMaps(f.env)); assert.deepEqual(f.deletes, []);
  }
});
test("fresh metadata or catalogue changes skip deletion", async () => {
  for (const mode of ["moved", "modified", "registered", "listed"]) {
    const f = fixture([file(1, false), file(10)], [entry(10)]);
    f.onRead(id => {
      if (id !== file(1).id) return;
      if (mode === "moved") f.files[0].parents = ["another-folder"];
      if (mode === "modified") f.files[0].modifiedTime = at(0);
      if (mode === "registered") f.files[0].appProperties.ks2_registered_at = at(0);
    });
    if (mode === "listed") {
      let reads = 0;
      f.env.KS_KV.get = (async () => ++reads === 1 ? [entry(10)] : [entry(10), entry(1)]) as any;
    }
    const result = await cleanupMaps(f.env); assert.deepEqual(f.deletes, []); assert.equal(result.skipped.length, 1);
  }
});
test("dry-run and disabled preview are read-only; transient failures retry and deletion batches stay bounded", async () => {
  const f = fixture();
  assert.equal((await cleanupMaps(f.env, true)).eligible, 2); assert.deepEqual(f.deletes, []);
  f.env.MAP_RETENTION_ENABLED = "false";
  assert.equal((await cleanupMaps(f.env)).dry_run, true); assert.deepEqual(f.deletes, []);
  f.env.MAP_RETENTION_ENABLED = "true"; f.fail(file(1).id);
  assert.deepEqual((await cleanupMaps(f.env)).failed, [file(1).id]);
  f.fail(""); assert.deepEqual((await cleanupMaps(f.env)).deleted, [file(1).id]);
  const g = fixture(Array.from({ length: 25 }, (_, i) => file(i + 1)), Array.from({ length: 10 }, (_, i) => entry(25 - i)));
  const batch = await cleanupMaps(g.env); assert.equal(batch.deleted.length, 10); assert.equal(batch.deferred, 5);
});
test("registration marks verified maps, is idempotent, and refuses aged unregistered uploads", async () => {
  const f = fixture([file(1, false, 1)], []);
  await registerDriveMap(f.env, entry(1), []); await registerDriveMap(f.env, entry(1), []);
  assert.deepEqual(f.patches, [file(1).id]); assert.equal((await cleanupMaps(f.env, true).catch(() => null)), null);
  const g = fixture([file(1, false, 25)], []);
  await assert.rejects(registerDriveMap(g.env, entry(1), []), ExpiredMapUpload); assert.deepEqual(g.patches, []);
  await registerDriveMap(g.env, entry(1), [entry(1)]); // Existing legacy catalogue migration is safe.
  assert.equal(g.patches.length, 1);
  const evicted = fixture([file(1, true, 1)], []);
  await assert.rejects(registerDriveMap(evicted.env, entry(1), []), ExpiredMapUpload);
  assert.deepEqual(evicted.patches, []);
});
test("idempotent completion never rewrites a possibly stale catalogue", async () => {
  const f = fixture([file(1)], [entry(1)]);
  f.env.MAP_RETENTION_ENABLED = "false";
  const response = await app.request("https://example.test/api/map-export/complete", { method: "POST",
    headers: { Authorization: "Bearer machine", "Content-Type": "application/json" }, body: JSON.stringify(entry(1)) }, f.env);
  assert.equal(response.status, 200); assert.deepEqual(f.writes, []);
});
test("completion schedules cleanup only after successful registration; maintenance failure does not fail publication", async () => {
  const f = fixture([file(1), file(2, false, 1)], [entry(1)]);
  f.setIncomplete();
  const waiting: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => waiting.push(p.catch(() => "cleanup_failed")), passThroughOnException() {} };
  const result = await app.request("https://example.test/api/map-export/complete", { method: "POST",
    headers: { Authorization: "Bearer machine", "Content-Type": "application/json" }, body: JSON.stringify(entry(2)) }, f.env, ctx as any);
  assert.equal(result.status, 200); assert.deepEqual(f.writes, [EXPORT_CATALOG_KEY]);
  assert.deepEqual(await Promise.all(waiting), ["cleanup_failed"]); assert.deepEqual(f.deletes, []);
});
test("scheduled handler runs retention; maintenance API requires machine authentication and explicit dry_run", async () => {
  const f = fixture();
  for (const init of [{ method: "POST" }, { method: "POST", headers: { Cookie: "__Host-KS_ADMIN=anything" } }]) {
    assert.equal((await app.request("https://example.test/api/map-export/cleanup", init, f.env)).status, 401);
  }
  const call = (body: object) => app.request("https://example.test/api/map-export/cleanup", { method: "POST",
    headers: { Authorization: "Bearer machine", "Content-Type": "application/json" }, body: JSON.stringify(body) }, f.env);
  assert.equal((await call({})).status, 400);
  assert.equal((await call({ dry_run: true })).status, 200); assert.deepEqual(f.deletes, []);
  let task: Promise<unknown> | undefined;
  worker.scheduled({} as ScheduledController, f.env, { waitUntil: p => { task = p; } } as ExecutionContext);
  await task; assert.equal(f.deletes.length, 2);
});

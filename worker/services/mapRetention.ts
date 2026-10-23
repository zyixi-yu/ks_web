import { driveFetch, validDriveId } from "./driveStorage";
import { catalog, MapExport, parseExport } from "./mapExports";

const API = "https://www.googleapis.com/drive/v3/files";
const FIELDS = "id,name,description,parents,appProperties,trashed,mimeType,createdTime,modifiedTime,size,sha256Checksum,ownedByMe";
const HOUR = 3600000;
const MAX_PAGES = 5;
const MAX_DELETES = 10;
interface DriveFile {
  id: string; name: string; description: string; parents: string[]; appProperties: Record<string, string>;
  trashed: boolean; mimeType: string; createdTime: string; modifiedTime: string; size: string;
  sha256Checksum: string; ownedByMe: boolean;
}
interface OwnedMap { file: DriveFile; entry: MapExport; registeredAt: number | null }
type Reason = "older_version" | "abandoned_upload";
export class ExpiredMapUpload extends Error {}

// Metadata only: never download or buffer a map during maintenance.
async function metadata(env: Env, id: string): Promise<DriveFile | null> {
  if (!validDriveId(id)) throw new Error("Invalid map ID");
  const r = await driveFetch(env, `${API}/${id}?fields=${FIELDS}`, { signal: AbortSignal.timeout(5000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Map metadata unavailable");
  return r.json();
}
function ownedMap(env: Env, file: DriveFile): OwnedMap | null {
  try {
    if (!validDriveId(file.id) || file.ownedByMe !== true || file.trashed !== false
      || file.parents?.length !== 1 || file.parents[0] !== env.DRIVE_FOLDER_ID
      || file.appProperties?.ks2_export !== "1" || file.mimeType !== "application/octet-stream") return null;
    const entry = parseExport(JSON.parse(file.description));
    if (entry.drive_file_id || file.name !== `${entry.version}.SC2Map` || file.appProperties.version !== entry.version
      || !Number.isFinite(Date.parse(file.createdTime)) || !Number.isFinite(Date.parse(file.modifiedTime))) return null;
    const marker = file.appProperties.ks2_registered_at;
    const registeredAt = marker === undefined ? null : Date.parse(marker);
    if (registeredAt !== null && !Number.isFinite(registeredAt)) return null;
    return { file, entry, registeredAt };
  } catch { return null; }
}
function intact(map: OwnedMap) {
  return Number(map.file.size) === map.entry.bytes && map.file.sha256Checksum === map.entry.sha256;
}
function fingerprint(file: DriveFile): string {
  return JSON.stringify([file.id, file.name, file.description, file.parents, Object.entries(file.appProperties || {}).sort(),
    file.trashed, file.mimeType, file.createdTime, file.modifiedTime, file.size, file.sha256Checksum, file.ownedByMe]);
}
const compare = (a: MapExport, b: MapExport) => Date.parse(b.merged_at) - Date.parse(a.merged_at) || b.pipeline_id - a.pipeline_id;

// Register in Drive before publishing to KV. This prevents a stale KV catalogue
// from treating a newly completed map as an abandoned upload. Legacy listed maps
// can be registered without an age restriction; new uploads must finish in 24h.
// Cleanup's 48h threshold leaves a full day between registration and deletion.
export async function registerDriveMap(env: Env, entry: MapExport, current: MapExport[]): Promise<void> {
  const file = await metadata(env, entry.drive_file_id!);
  const map = file && ownedMap(env, file);
  if (!map || !intact(map) || JSON.stringify(parseExport({ ...map.entry, drive_file_id: file!.id })) !== JSON.stringify(entry)) {
    throw new Error("Map changed before registration");
  }
  const listed = current.some(x => x.drive_file_id === entry.drive_file_id && JSON.stringify(x) === JSON.stringify(entry));
  if (map.registeredAt !== null) {
    // A lost first acknowledgement may be retried briefly. An evicted version
    // must not be republished while cleanup is deleting it (cleanup waits 1h).
    if (!listed && Date.now() - map.registeredAt >= HOUR / 2) throw new ExpiredMapUpload();
    return;
  }
  if (!listed && Date.now() - Date.parse(map.file.createdTime) >= 24 * HOUR) throw new ExpiredMapUpload();
  const r = await driveFetch(env, `${API}/${file!.id}?fields=id`, {
    method: "PATCH", signal: AbortSignal.timeout(5000), headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appProperties: { ks2_registered_at: new Date().toISOString() } }),
  });
  if (!r.ok) throw new Error("Map registration unavailable");
}

async function inventory(env: Env): Promise<DriveFile[]> {
  if (!validDriveId(env.DRIVE_FOLDER_ID)) throw new Error("Map folder unavailable");
  const files: DriveFile[] = [];
  let page = "";
  for (let i = 0; i < MAX_PAGES; i++) {
    const query = new URLSearchParams({
      q: `'${env.DRIVE_FOLDER_ID}' in parents and trashed = false and appProperties has { key='ks2_export' and value='1' }`,
      spaces: "drive", corpora: "user", pageSize: "100", fields: `nextPageToken,incompleteSearch,files(${FIELDS})`,
      ...(page ? { pageToken: page } : {}),
    });
    const r = await driveFetch(env, `${API}?${query}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error("Map inventory unavailable");
    const data = await r.json() as { files?: DriveFile[]; nextPageToken?: string; incompleteSearch?: boolean };
    if (data.incompleteSearch || !Array.isArray(data.files)) throw new Error("Incomplete map inventory");
    files.push(...data.files);
    if (!data.nextPageToken) {
      if (new Set(files.map(x => x.id)).size !== files.length) throw new Error("Unstable map inventory");
      return files;
    }
    page = data.nextPageToken;
  }
  throw new Error("Map inventory exceeds maintenance limit");
}

function deletionReason(map: OwnedMap, protectedVersions: Set<string>, protectedIds: Set<string>, now: number): Reason | null {
  if (protectedIds.has(map.file.id) || protectedVersions.has(map.entry.version)) return null;
  if (map.registeredAt !== null) {
    // A short grace period protects concurrent registration/KV propagation.
    return intact(map) && now - map.registeredAt >= HOUR ? "older_version" : null;
  }
  // Drive timestamps, never the build's supplied dates. Both must have aged out;
  // resumable uploads and files modified by another actor stay untouched.
  return now - Date.parse(map.file.createdTime) >= 48 * HOUR
    && now - Date.parse(map.file.modifiedTime) >= 48 * HOUR ? "abandoned_upload" : null;
}

export async function cleanupMaps(env: Env, dryRun = false) {
  const now = Date.now();
  const deadline = now + 20000;
  // The flag defaults off and is explicitly enabled only in production.
  const dry = dryRun || env.MAP_RETENTION_ENABLED !== "true";
  const current = await catalog(env);
  if (!current.length || current.some(x => !x.drive_file_id)) throw new Error("No valid retention catalogue");
  const files = await inventory(env);
  const maps = files.map(file => ownedMap(env, file)).filter((x): x is OwnedMap => x !== null);
  // A missing/corrupt listed file indicates inconsistent state: delete nothing.
  for (const entry of current) {
    const map = maps.find(x => x.file.id === entry.drive_file_id);
    if (!map || !intact(map) || JSON.stringify(parseExport({ ...map.entry, drive_file_id: map.file.id })) !== JSON.stringify(entry)) {
      throw new Error("Retention catalogue does not match storage");
    }
  }
  // Independently preserve the newest ten registered versions in Drive, including
  // a registration not yet visible in this region's eventually consistent KV.
  const ranked = [...current, ...maps.filter(x => x.registeredAt !== null && intact(x)).map(x => x.entry)].sort(compare);
  const protectedVersions = new Set([...new Set(ranked.map(x => x.version))].slice(0, 10));
  const protectedIds = new Set(current.map(x => x.drive_file_id!));
  const candidates = maps.flatMap(map => {
    const reason = deletionReason(map, protectedVersions, protectedIds, now);
    return reason ? [{ map, reason }] : [];
  });
  const report = { dry_run: dry, scanned: files.length, protected: maps.filter(x => protectedIds.has(x.file.id) || protectedVersions.has(x.entry.version)).length,
    eligible: candidates.length, deleted: [] as string[], skipped: [] as string[], failed: [] as string[], deferred: 0,
    candidates: candidates.map(x => ({ id: x.map.file.id, version: x.map.entry.version, reason: x.reason })) };
  if (dry) return report;
  for (const { map, reason } of candidates.slice(0, MAX_DELETES)) {
    if (Date.now() >= deadline) break;
    try {
      // Recheck both catalogue and ownership immediately before deletion.
      const latest = await catalog(env);
      if (!latest.length) throw new Error("Catalogue unavailable");
      const fresh = await metadata(env, map.file.id);
      if (!fresh) { report.skipped.push(map.file.id); continue; }
      const checked = ownedMap(env, fresh);
      if (!checked || fingerprint(fresh) !== fingerprint(map.file)
        || latest.some(x => x.drive_file_id === map.file.id || x.version === map.entry.version)
        || deletionReason(checked, protectedVersions, protectedIds, now) !== reason) {
        report.skipped.push(map.file.id); continue;
      }
      const r = await driveFetch(env, `${API}/${map.file.id}`, { method: "DELETE", signal: AbortSignal.timeout(5000) });
      if (r.status !== 204 && r.status !== 404) throw new Error("Map deletion unavailable");
      (r.status === 204 ? report.deleted : report.skipped).push(map.file.id);
    } catch { report.failed.push(map.file.id); }
  }
  report.deferred = candidates.length - report.deleted.length - report.skipped.length - report.failed.length;
  return report;
}

export async function maintainMaps(env: Env): Promise<void> {
  if (env.MAP_RETENTION_ENABLED !== "true") return;
  const report = await cleanupMaps(env);
  console.log(JSON.stringify({ event: "map_retention", ...report }));
  if (report.failed.length) throw new Error("Some obsolete maps could not be removed; retry on next maintenance run");
}

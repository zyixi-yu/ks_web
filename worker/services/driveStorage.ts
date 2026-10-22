import { MapExport, parseExport } from "./mapExports";

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
export const validDriveId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(value);
const tokens = new WeakMap<object, { value: string; expires: number }>();

async function accessToken(env: Env): Promise<string> {
  const cached = tokens.get(env);
  if (cached && cached.expires > Date.now() + 60000) return cached.value;
  if (!env.DRIVE_CLIENT_ID || !env.DRIVE_CLIENT_SECRET || !env.DRIVE_REFRESH_TOKEN) throw new Error("Drive is not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.DRIVE_CLIENT_ID, client_secret: env.DRIVE_CLIENT_SECRET,
      refresh_token: env.DRIVE_REFRESH_TOKEN, grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error(`Drive authorization HTTP ${response.status}`);
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token || !Number.isFinite(data.expires_in)) throw new Error("Invalid Drive authorization response");
  tokens.set(env, { value: data.access_token, expires: Date.now() + Math.min(data.expires_in!, 3600) * 1000 });
  return data.access_token;
}

async function driveFetch(env: Env, url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, redirect: "manual", headers: {
    ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${await accessToken(env)}`,
  } });
}

export function validUploadUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === "https://www.googleapis.com" && url.pathname === "/upload/drive/v3/files"
      && url.searchParams.get("uploadType") === "resumable" && !!url.searchParams.get("upload_id")
      && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

export async function beginDriveUpload(env: Env, entry: MapExport): Promise<string> {
  if (!validDriveId(env.DRIVE_FOLDER_ID)) throw new Error("Drive folder is not configured");
  const { drive_file_id: _ignored, ...manifest } = entry;
  const response = await driveFetch(env, `${UPLOAD}?uploadType=resumable&fields=id`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Upload-Content-Type": "application/octet-stream",
      "X-Upload-Content-Length": String(entry.bytes) },
    body: JSON.stringify({ name: `${entry.version}.SC2Map`, mimeType: "application/octet-stream", parents: [env.DRIVE_FOLDER_ID],
      description: JSON.stringify(manifest), appProperties: { ks2_export: "1", version: entry.version } }),
  });
  const url = response.headers.get("location");
  if (!response.ok || !validUploadUrl(url)) throw new Error(`Drive upload initialization HTTP ${response.status}`);
  // This URL is a temporary upload credential. Return only to authenticated CI; never log it.
  return url;
}

export async function verifiedDriveEntry(env: Env, id: string): Promise<MapExport> {
  if (!validDriveId(id) || !validDriveId(env.DRIVE_FOLDER_ID)) throw new Error("Invalid Drive object");
  const response = await driveFetch(env, `${API}/${id}?fields=id,name,size,sha256Checksum,description,parents,appProperties,trashed,mimeType`);
  if (!response.ok) throw new Error(`Drive metadata HTTP ${response.status}`);
  const file = await response.json() as { id: string; name: string; size: string; sha256Checksum: string; description: string;
    parents?: string[]; appProperties?: Record<string, string>; trashed?: boolean; mimeType?: string };
  if (file.trashed || file.id !== id || !file.parents?.includes(env.DRIVE_FOLDER_ID)
    || file.appProperties?.ks2_export !== "1" || file.mimeType !== "application/octet-stream") throw new Error("Unexpected Drive object");
  const entry = parseExport(JSON.parse(file.description));
  if (file.name !== `${entry.version}.SC2Map` || file.appProperties.version !== entry.version
    || Number(file.size) !== entry.bytes || file.sha256Checksum !== entry.sha256) throw new Error("Drive object integrity mismatch");
  return parseExport({ ...entry, drive_file_id: id });
}

export async function driveDownload(env: Env, entry: MapExport): Promise<Response> {
  if (!validDriveId(entry.drive_file_id)) throw new Error("Drive object is missing");
  const verified = await verifiedDriveEntry(env, entry.drive_file_id);
  if (JSON.stringify(verified) !== JSON.stringify(entry)) throw new Error("Drive manifest changed");
  const response = await driveFetch(env, `${API}/${entry.drive_file_id}?alt=media`, { headers: { "Accept-Encoding": "identity" } });
  const length = response.headers.get("content-length");
  if (!response.ok || !response.body || (length !== null && Number(length) !== entry.bytes)
    || (response.headers.get("content-encoding") && response.headers.get("content-encoding") !== "identity")) {
    await response.body?.cancel();
    throw new Error(`Drive download HTTP ${response.status}`);
  }
  // Drive may use chunked transfer. Validate bytes as they stream rather than
  // requiring Content-Length; metadata and CI's full readback supply the digest.
  let received = 0;
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > entry.bytes) throw new Error("Drive download exceeds expected size");
      controller.enqueue(chunk);
    },
    flush() { if (received !== entry.bytes) throw new Error("Drive download is incomplete"); },
  }));
  return new Response(body, { headers: { "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="KS2_CN_${entry.source_sha.slice(0, 12)}.SC2Map"`,
    "Content-Length": String(entry.bytes), "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff", "X-Map-SHA256": entry.sha256 } });
}

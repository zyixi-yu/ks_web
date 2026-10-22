export const EXPORT_CATALOG_KEY = "cn_map_exports_v1";
export const PACKAGE_NAME = "cn-map-export";
export const GITLAB_API = "https://git.kerrigansurvival.com/api/v4/projects/52";
export const MAP_FILE = "KerriganSurvival2_CN.SC2Map";

export interface MapExport {
  version: string;
  export_kind: "translation_merge" | "scheduled";
  source_sha: string;
  build_sha: string;
  map_version: string;
  map_name: string;
  map_index: number;
  created_at: string;
  merged_at: string;
  mr_iid: number;
  pipeline_id: number;
  bytes: number;
  sha256: string;
  maps_sha: string;
  bridge_sha256: string;
}

export function parseExport(value: unknown): MapExport {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid manifest");
  const x = value as Record<string, unknown>;
  const kind = x.export_kind ?? "translation_merge";
  if (kind !== "translation_merge" && kind !== "scheduled") throw new Error("Invalid export kind");
  for (const k of ["source_sha", "build_sha", "maps_sha"]) if (typeof x[k] !== "string" || !/^[a-f0-9]{40}$/.test(x[k] as string)) throw new Error("Invalid source");
  for (const k of ["sha256", "bridge_sha256"]) if (typeof x[k] !== "string" || !/^[a-f0-9]{64}$/.test(x[k] as string)) throw new Error("Invalid digest");
  if (typeof x.version !== "string" || !/^[a-f0-9]{40}-\d+$/.test(x.version) || !x.version.startsWith(`${x.source_sha}-`)) throw new Error("Invalid version");
  for (const k of ["created_at", "merged_at"]) if (typeof x[k] !== "string" || !Number.isFinite(Date.parse(x[k] as string))) throw new Error("Invalid date");
  for (const k of ["mr_iid", "pipeline_id", "map_index", "bytes"]) if (!Number.isSafeInteger(x[k]) || (x[k] as number) < (k === "map_index" || (k === "mr_iid" && kind === "scheduled") ? 0 : 1)) throw new Error("Invalid number");
  if (x.version !== `${x.source_sha}-${x.pipeline_id}`) throw new Error("Version pipeline mismatch");
  if ((x.bytes as number) > 200 * 1024 * 1024) throw new Error("Map exceeds size limit");
  for (const k of ["map_name", "map_version"]) if (typeof x[k] !== "string" || !(x[k] as string).length || (x[k] as string).length > 160) throw new Error("Invalid map information");
  return { ...Object.fromEntries(["version", "source_sha", "build_sha", "map_version", "map_name", "map_index", "created_at", "merged_at", "mr_iid", "pipeline_id", "bytes", "sha256", "maps_sha", "bridge_sha256"].map(k => [k, x[k]])), export_kind: kind } as unknown as MapExport;
}

export async function catalog(env: Env): Promise<MapExport[]> {
  const value = await env.KS_KV.get(EXPORT_CATALOG_KEY, "json");
  return Array.isArray(value) ? value.map(parseExport).slice(0, 10) : [];
}

export function packageUrl(version: string, filename: string): string {
  return `${GITLAB_API}/packages/generic/${PACKAGE_NAME}/${encodeURIComponent(version)}/${filename}`;
}

export async function packageFetch(env: Env, version: string, filename: string, method = "GET"): Promise<Response> {
  if (!env.MAP_PACKAGE_READ_TOKEN) throw new Error("Private package access is not configured");
  const response = await fetch(packageUrl(version, filename), {
    method, headers: { "DEPLOY-TOKEN": env.MAP_PACKAGE_READ_TOKEN, "User-Agent": "KS2-MapExport/1.0" }, redirect: "manual",
  });
  if (!response.ok) console.error("private_package_http_error", { status: response.status, method });
  return response;
}

export function updatedCatalog(items: MapExport[], entry: MapExport): MapExport[] {
  return [entry, ...items.filter(x => x.version !== entry.version)]
    .sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at) || b.pipeline_id - a.pipeline_id).slice(0, 10);
}

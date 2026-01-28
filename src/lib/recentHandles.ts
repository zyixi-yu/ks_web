export type RecentHandle = {
  handle: string;
  lastUsed: number;
};

export const RECENT_STORAGE_KEY = "ks_recent_handles_v1";
const RECENT_MAX = 8;

export function loadRecentHandles(): RecentHandle[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => ({
        handle: String((x as any)?.handle || "").trim(),
        lastUsed: Number((x as any)?.lastUsed || 0),
      }))
      .filter((x) => x.handle.length > 0)
      .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function saveRecentHandle(nextHandle: string): RecentHandle[] {
  const h = nextHandle.trim();
  if (!h) return loadRecentHandles();
  const now = Date.now();
  const current = loadRecentHandles().filter((x) => x.handle.toUpperCase() !== h.toUpperCase());
  const next = [{ handle: h, lastUsed: now }, ...current].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}


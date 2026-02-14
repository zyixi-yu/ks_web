const DID_KEY = "ks_did_v1";

function makeDid(): string {
  try {
    if (globalThis.crypto && "randomUUID" in globalThis.crypto) {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // ignore
  }

  return `did_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Anonymous device id (did).
 *
 * - Stable across sessions via localStorage when available.
 * - Falls back to a per-load value when storage is unavailable.
 */
export function getOrCreateDid(): string {
  try {
    const existing = localStorage.getItem(DID_KEY);
    if (existing && existing.length >= 8) return existing;

    const did = makeDid();
    localStorage.setItem(DID_KEY, did);
    return did;
  } catch {
    return makeDid();
  }
}

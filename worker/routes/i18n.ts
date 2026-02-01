import { Hono } from "hono";
import type { Context } from "hono";
import { kvGetText } from "../services/kv";
import { jsonError, jsonOk } from "../utils/http";

type HonoEnv = { Bindings: Env };

type I18nEntry = {
  key: string;
  en: string;
  cn: string;
};

const KV_KEY_CN = "ks_gs_new_cn";
const KV_KEY_EN = "ks_gs_new_en";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// KV updates are infrequent (1-2 days). Allow some lag.
const REFRESH_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const i18n = new Hono<HonoEnv>();

let cachedEntries: I18nEntry[] | null = null;
let cachedLoadedAtMs = 0;
let refreshInFlight: Promise<void> | null = null;

function sanitizeSc2LocalizationText(input: string): string {
  let text = input;
  // Newline tags.
  text = text.replace(/<n\s*\/\s*>/gi, "\n");
  // Numeric reference tags.
  text = text.replace(/<d\b[^>]*\/\s*>/gi, "X");
  // Remove other tags (keep plain text inside).
  text = text.replace(/<\/?[^>]+>/g, "");
  return text;
}

function parseKeyValueLines(body: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = body.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    if (!key) continue;
    const value = line.slice(eqIdx + 1);
    map.set(key, value);
  }
  return map;
}

async function rebuildCache(kv: KVNamespace): Promise<void> {
  const [cnBody, enBody] = await Promise.all([kvGetText(kv, KV_KEY_CN), kvGetText(kv, KV_KEY_EN)]);
  if (cnBody == null) throw new Error(`KV key not found: ${KV_KEY_CN}`);
  if (enBody == null) throw new Error(`KV key not found: ${KV_KEY_EN}`);

  const enMap = parseKeyValueLines(enBody);
  const entries: I18nEntry[] = [];

  const cnLines = cnBody.split(/\r?\n/);
  for (const rawLine of cnLines) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    if (!key) continue;
    const cnRaw = line.slice(eqIdx + 1);
    const enRaw = enMap.get(key) ?? "";
    entries.push({
      key,
      cn: sanitizeSc2LocalizationText(cnRaw),
      en: sanitizeSc2LocalizationText(enRaw),
    });
  }

  cachedEntries = entries;
  cachedLoadedAtMs = Date.now();
}

async function ensureCache(c: Context<HonoEnv>): Promise<void> {
  if (!c.env.KS_KV || typeof (c.env.KS_KV as any).get !== "function") {
    throw new Error("KV binding missing: KS_KV");
  }

  const now = Date.now();
  const hasCache = Array.isArray(cachedEntries) && cachedEntries.length >= 0;

  if (!hasCache) {
    if (!refreshInFlight) {
      refreshInFlight = rebuildCache(c.env.KS_KV).finally(() => {
        refreshInFlight = null;
      });
    }
    await refreshInFlight;
    return;
  }

  if (now - cachedLoadedAtMs < REFRESH_CHECK_INTERVAL_MS) return;

  // Background refresh (do not block current request).
  if (!refreshInFlight) {
    refreshInFlight = rebuildCache(c.env.KS_KV)
      .catch((e) => {
        console.error("i18n cache refresh failed", e);
      })
      .finally(() => {
        refreshInFlight = null;
      });
    c.executionCtx.waitUntil(refreshInFlight);
  }
}

i18n.get("/search", async (c) => {
  c.header("X-KS-Mock-KV", (globalThis as any).__KS_NO_CACHE ? "1" : "0");

  const url = new URL(c.req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const pageRaw = url.searchParams.get("page") || "1";
  const pageSizeRaw = url.searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE);

  const page = Math.max(1, Number.parseInt(pageRaw, 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(pageSizeRaw, 10) || DEFAULT_PAGE_SIZE),
  );

  if (!q) {
    return jsonOk(
      c,
      { total: 0, page, pageSize, items: [] },
      {
        cacheControl: "no-store",
      },
    );
  }

  try {
    await ensureCache(c);
  } catch (e) {
    return jsonError(c, 500, (e instanceof Error ? e.message : "") || "Failed to load i18n data");
  }

  const keywords = q.split(/\s+/).map((x) => x.trim()).filter(Boolean);
  if (keywords.length === 0) {
    return jsonOk(c, { total: 0, page, pageSize, items: [] }, { cacheControl: "no-store" });
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  let matchIndex = 0;
  const items: I18nEntry[] = [];

  for (const entry of cachedEntries ?? []) {
    if (!keywords.every((kw) => entry.cn.includes(kw))) continue;

    if (matchIndex >= start && matchIndex < end) {
      items.push(entry);
    }
    matchIndex += 1;
  }

  return jsonOk(
    c,
    {
      total: matchIndex,
      page,
      pageSize,
      items,
    },
    { cacheControl: "no-store" },
  );
});

export default i18n;

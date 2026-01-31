import { Hono } from "hono";
import { constantTimeEqual, parseBearerToken } from "../services/auth";
import { kvGetJson } from "../services/kv";
import { jsonError, jsonOk } from "../utils/http";

type HonoEnv = { Bindings: Env };

const verifyCode = new Hono<HonoEnv>();

function requireVerifyToken(c: any): Response | null {
  const configured = (c.env.VERIFY_CODE_TOKEN || "").trim();
  if (!configured) return jsonError(c as any, 500, "VERIFY_CODE_TOKEN not configured");
  const got = parseBearerToken((c.req.raw.headers.get("Authorization") || "").trim());
  if (!got) return jsonError(c as any, 401, "Missing Authorization");
  if (!constantTimeEqual(got, configured)) return jsonError(c as any, 401, "Invalid token");
  return null;
}

type VerifyWriteBody = { sms?: unknown };

function extractLast6DigitCode(sms: string): string | null {
  const matches = sms.match(/(?<!\d)\d{6}(?!\d)/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1] || null;
}

verifyCode.post("/write", async (c) => {
  c.header("X-KS-Mock-KV", (globalThis as any).__KS_NO_CACHE ? "1" : "0");
  const authErr = requireVerifyToken(c as any);
  if (authErr) return authErr;

  if (!c.env.KS_KV || typeof (c.env.KS_KV as any).put !== "function") {
    return jsonError(c, 500, "KV binding missing: KS_KV");
  }

  let body: VerifyWriteBody;
  try {
    body = (await c.req.json()) as VerifyWriteBody;
  } catch {
    return jsonError(c, 400, "Invalid JSON body");
  }

  const sms = typeof body.sms === "string" ? body.sms : "";
  if (!sms.trim()) return jsonError(c, 400, "Missing sms");

  const code = extractLast6DigitCode(sms);
  if (!code) return jsonError(c, 400, "No 6-digit code found in sms");

  const key = "sms_verify_code_v1";
  const payload = JSON.stringify({ code, created_at: Math.floor(Date.now() / 1000) });
  await c.env.KS_KV.put(key, payload, { expirationTtl: 180 });

  return jsonOk(c, { ok: true, expires_in: 180 }, { cacheControl: "no-store" });
});

verifyCode.get("/read", async (c) => {
  c.header("X-KS-Mock-KV", (globalThis as any).__KS_NO_CACHE ? "1" : "0");
  const authErr = requireVerifyToken(c as any);
  if (authErr) return authErr;

  if (!c.env.KS_KV || typeof (c.env.KS_KV as any).get !== "function") {
    return jsonError(c, 500, "KV binding missing: KS_KV");
  }

  const key = "sms_verify_code_v1";
  let raw: unknown;
  try {
    raw = await kvGetJson(c.env.KS_KV, key);
  } catch (e) {
    return jsonError(c, 500, (e instanceof Error ? e.message : "") || "KV verify code parse error");
  }
  if (!raw) return jsonError(c, 404, "No active verify code");

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return jsonError(c, 500, "KV verify code format error");
  const obj = raw as Record<string, unknown>;
  const code = typeof obj.code === "string" ? obj.code : "";
  const createdAt = typeof obj.created_at === "number" ? obj.created_at : Number(obj.created_at);
  if (!code || !Number.isFinite(createdAt)) return jsonError(c, 500, "KV verify code format error");

  c.header("Cache-Control", "no-store");
  return jsonOk(c, { code, created_at: createdAt, expires_in: 180 }, { cacheControl: "no-store" });
});

export default verifyCode;


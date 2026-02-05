import { constantTimeEqual, parseBearerToken } from "./auth";
import { jsonError } from "../utils/http";

type TokenEnvVar = "VERIFY_CODE_TOKEN";

export function requireEnvToken(c: any, envVar: TokenEnvVar): Response | null {
  const configured = String(((c.env as any)?.[envVar] || "")).trim();
  if (!configured) return jsonError(c as any, 500, `${envVar} not configured`);

  const got = parseBearerToken((c.req.raw.headers.get("Authorization") || "").trim());
  if (!got) return jsonError(c as any, 401, "Missing Authorization");
  if (!constantTimeEqual(got, configured)) return jsonError(c as any, 401, "Invalid token");
  return null;
}


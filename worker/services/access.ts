import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyAdministrator(token: string, env: Env): Promise<string> {
  const issuer = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  const emails = (env.ADMIN_EMAILS || "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (!issuer || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !audience || !emails.length) {
    throw new Error("Access is not configured");
  }
  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keySets.set(issuer, keys);
  }
  const { payload } = await jwtVerify(token, keys, { issuer, audience, algorithms: ["RS256"], requiredClaims: ["exp", "iat", "sub", "email"] });
  if (typeof payload.email !== "string" || !emails.includes(payload.email.toLowerCase())) throw new Error("Not an administrator");
  return payload.email;
}

export const requireAdministrator: MiddlewareHandler<{ Bindings: Env; Variables: { adminEmail: string } }> = async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) return c.json({ error: "Administrator sign-in required" }, 401);
  try {
    c.set("adminEmail", await verifyAdministrator(token, c.env));
  } catch {
    return c.json({ error: "Invalid administrator session" }, 403);
  }
  await next();
};

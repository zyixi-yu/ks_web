import { SignJWT, jwtVerify } from "jose";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import type { MiddlewareHandler } from "hono";

type Account = { username: string; salt: string; hash: string; version: string };
type AdminEnv = { Bindings: Env; Variables: { adminUsername: string } };
const COOKIE = "__Host-KS_ADMIN";
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();

function accounts(env: Env): Account[] {
  const value: unknown = JSON.parse(env.ADMIN_ACCOUNTS || "null");
  if (!Array.isArray(value) || !value.length || value.length > 3 || value.some(a => !a || !/^[a-zA-Z0-9_-]{1,32}$/.test(a.username) || !/^[a-f0-9]{32}$/.test(a.salt) || !/^[a-f0-9]{64}$/.test(a.hash) || !/^[a-f0-9]{32}$/.test(a.version))) throw new Error("Administrator accounts unavailable");
  return value;
}
function signingKey(env: Env): Uint8Array {
  if (!env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET.length < 43) throw new Error("Session signing unavailable");
  return encoder.encode(env.ADMIN_SESSION_SECRET);
}
export async function passwordDigest(salt: string, password: string): Promise<string> {
  // Passwords are issued as random 256-bit credentials, not user-chosen words.
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(`ks-admin-v1:${salt}:${password}`));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
function equal(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}
export const adminHeaders: MiddlewareHandler<AdminEnv> = async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  await next();
};
export const requireAdministrator: MiddlewareHandler<AdminEnv> = async (c, next) => {
  try {
    const { payload } = await jwtVerify(getCookie(c, COOKIE) || "", signingKey(c.env), {
      issuer: "ks-admin", audience: "ks-admin", algorithms: ["HS256"], requiredClaims: ["exp", "iat", "sub", "version"], maxTokenAge: SESSION_SECONDS,
    });
    const account = accounts(c.env).find(a => a.username === payload.sub && a.version === payload.version);
    if (!account) throw new Error("Account changed");
    c.set("adminUsername", account.username);
  } catch { return c.json({ error: "Administrator sign-in required" }, 401); }
  await next();
};
const auth = new Hono<AdminEnv>();
auth.use("*", async (c, next) => {
  if (c.req.method !== "POST" || c.req.header("Origin") !== new URL(c.req.url).origin) return c.json({ error: "Same-origin POST required" }, 403);
  await next();
});
auth.post("/login", bodyLimit({ maxSize: 1024, onError: c => c.json({ error: "Request too large" }, 413) }), async c => {
  if (!c.env.ADMIN_LOGIN_LIMIT) return c.json({ error: "Sign-in unavailable" }, 503);
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  if (!(await c.env.ADMIN_LOGIN_LIMIT.limit({ key: `ks-admin:ip:${ip}` })).success) {
    c.header("Retry-After", "60"); return c.json({ error: "Too many attempts; try again shortly" }, 429);
  }
  if (!c.req.header("Content-Type")?.startsWith("application/json")) return c.json({ error: "Invalid sign-in" }, 400);
  let value: { username?: unknown; password?: unknown };
  try { value = await c.req.json(); } catch (error) { if (error instanceof Error && error.name === "BodyLimitError") return c.json({ error: "Request too large" }, 413); return c.json({ error: "Invalid sign-in" }, 400); }
  if (!value || typeof value.username !== "string" || typeof value.password !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.password)) return c.json({ error: "Invalid username or password" }, 401);
  const account = accounts(c.env).find(a => a.username === value.username);
  const hash = await passwordDigest(account?.salt || "0".repeat(32), value.password);
  if (!account || !equal(hash, account.hash)) return c.json({ error: "Invalid username or password" }, 401);
  const jwt = await new SignJWT({ version: account.version }).setProtectedHeader({ alg: "HS256" })
    .setIssuer("ks-admin").setAudience("ks-admin").setSubject(account.username).setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(signingKey(c.env));
  setCookie(c, COOKIE, jwt, { httpOnly: true, secure: true, sameSite: "Strict", path: "/", maxAge: SESSION_SECONDS });
  return c.json({ username: account.username });
});
auth.post("/logout", c => {
  deleteCookie(c, COOKIE, { httpOnly: true, secure: true, sameSite: "Strict", path: "/" });
  return c.json({ signed_out: true });
});
export default auth;

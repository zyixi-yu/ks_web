import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function jsonError(c: Context, status: ContentfulStatusCode, message: string): Response {
  // Make 5xx causes visible in Workers Logs without requiring the client to capture the response body.
  if (status >= 500) console.error(`[api] ${status} ${message}`);
  c.header("Content-Type", "application/json; charset=utf-8");
  return c.json({ error: message }, status);
}

export function jsonOk(
  c: Context,
  payload: unknown,
  opts?: {
    cacheControl?: string;
  },
): Response {
  c.header("Content-Type", "application/json; charset=utf-8");
  if (opts?.cacheControl) c.header("Cache-Control", opts.cacheControl);
  return c.json(payload as any, 200);
}

import type { Context } from "hono";

function looksLikeFile(pathname: string): boolean {
  return pathname.startsWith("/assets/") || pathname.includes(".");
}

function isHtmlNavigation(req: Request): boolean {
  const accept = req.headers.get("Accept") || "";
  if (accept.includes("text/html")) return true;
  const mode = req.headers.get("Sec-Fetch-Mode") || "";
  const dest = req.headers.get("Sec-Fetch-Dest") || "";
  return mode === "navigate" || dest === "document";
}

function withHeader(resp: Response, key: string, value: string): Response {
  const headers = new Headers(resp.headers);
  headers.set(key, value);
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}

export default async function assetsRoutes(c: Context): Promise<Response> {
  const req = c.req.raw;
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (looksLikeFile(pathname)) {
    const resp = await c.env.ASSETS.fetch(req);
    return withHeader(resp, "X-KS-SPA-Fallback", "0");
  }

  // SPA fallback:
  // - For real browsers, `Accept: text/html` or fetch navigation headers are present.
  // - For some embedded webviews/clients, those headers can be missing; in that case,
  //   treat GET/HEAD without a file extension as an HTML navigation as well.
  const method = req.method.toUpperCase();
  const shouldServeIndex =
    isHtmlNavigation(req) || method === "GET" || method === "HEAD";

  if (shouldServeIndex) {
    const indexUrl = new URL(req.url);
    // NOTE: On Cloudflare Assets, `/index.html` can be redirected to `/` (307).
    // Use `/` to reliably fetch the SPA entry HTML.
    indexUrl.pathname = "/";
    try {
      const resp = await c.env.ASSETS.fetch(new Request(indexUrl.toString(), req));
      return withHeader(resp, "X-KS-SPA-Fallback", "1");
    } catch (e) {
      console.warn("ASSETS fetch failed", e);
      return new Response("Worker Error", { status: 500, headers: { "X-KS-SPA-Fallback": "err" } });
    }
  }

  const resp = await c.env.ASSETS.fetch(req);
  return withHeader(resp, "X-KS-SPA-Fallback", "0");
}

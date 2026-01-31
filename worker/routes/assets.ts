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

export default async function assetsRoutes(c: Context): Promise<Response> {
  const req = c.req.raw;
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (looksLikeFile(pathname)) {
    return c.env.ASSETS.fetch(req);
  }

  // 方案 A：所有 HTML 导航统一回 index.html（由前端路由决定展示/重定向）
  if (isHtmlNavigation(req)) {
    const indexUrl = new URL(req.url);
    indexUrl.pathname = "/index.html";
    try {
      return await c.env.ASSETS.fetch(new Request(indexUrl.toString(), req));
    } catch (e) {
      console.warn("ASSETS fetch failed", e);
      return Response.redirect(new URL("/", url).toString(), 302);
    }
  }

  return c.env.ASSETS.fetch(req);
}


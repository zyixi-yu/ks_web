const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function withCors(resp: Response): Response {
  const headers = new Headers(resp.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}

function jsonError(status: number, message: string): Response {
  return withCors(
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return jsonError(405, "Method Not Allowed");
    }

    // API: 积分查询（同域代理）
    if (url.pathname === "/api/credits") {
      const handle = (url.searchParams.get("player_handle") || "").trim();
      if (!handle) return jsonError(400, "Missing player_handle");
      if (handle.length > 64) return jsonError(400, "player_handle too long");

      const upstream = new URL("https://credits.replayanalyzer.com/");
      upstream.searchParams.set("player_handle", handle);

      const resp = await fetch(upstream.toString(), {
        headers: { Accept: "application/json" },
        cf: { cacheTtl: 30, cacheEverything: true },
      });

      const headers = new Headers(resp.headers);
      headers.set("Cache-Control", "public, max-age=30");
      return withCors(new Response(resp.body, { status: resp.status, headers }));
    }

    // API: 钻石议会投票数据（同域代理）
    if (url.pathname === "/api/proposal_votes_cn.json") {
      const upstream = "https://data.194823.xyz/proposal_votes_cn.json";
      const resp = await fetch(upstream, {
        headers: { Accept: "application/json" },
        cf: { cacheTtl: 60, cacheEverything: true },
      });

      const headers = new Headers(resp.headers);
      headers.set("Cache-Control", "public, max-age=60");
      headers.set("Content-Type", "application/json; charset=utf-8");
      return withCors(new Response(resp.body, { status: resp.status, headers }));
    }

    // 静态资源：交给 Wrangler assets
    return env.ASSETS.fetch(request);
  },
};

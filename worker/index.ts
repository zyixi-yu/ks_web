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

type LeaderboardEntry = {
  display_name: string;
  handles: string[];
  mmr: number;
  team_key: "kerrigan" | "survivor";
  team_name: "凯瑞甘" | "幸存者";
  identity: string;
  tie: string;
};

function readIndexValue(map: unknown, idx: string): unknown {
  if (Array.isArray(map)) return map[Number(idx)];
  if (map && typeof map === "object") return (map as Record<string, unknown>)[idx];
  return undefined;
}

function toNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function toStringSafe(x: unknown): string {
  if (typeof x === "string") return x;
  if (x == null) return "";
  return String(x);
}

function toStringArray(x: unknown): string[] {
  if (Array.isArray(x)) return x.map(toStringSafe).filter((s) => s.length > 0);
  const s = typeof x === "string" ? x.trim() : "";
  return s ? [s] : [];
}

function defaultCache(): Cache {
  return (caches as unknown as { default: Cache }).default;
}

function computeLeaderboard(rawJson: unknown): {
  generated_at: string;
  boards: {
    kerrigan: Array<{
      rank: number;
      display_name: string;
      identity: string;
      handles: string[];
      mmr: number;
      team_name: "凯瑞甘";
    }>;
    survivor: Array<{
      rank: number;
      display_name: string;
      identity: string;
      handles: string[];
      mmr: number;
      team_name: "幸存者";
    }>;
  };
} {
  if (!rawJson || typeof rawJson !== "object") throw new Error("bridge_cn.json format error");
  const obj = rawJson as Record<string, unknown>;
  const generatedAt = obj["generated_at"];
  if (typeof generatedAt !== "string" || !generatedAt.trim()) throw new Error("bridge_cn.json missing generated_at");

  const leaderboard = obj["leaderboard"];
  if (!leaderboard || typeof leaderboard !== "object") throw new Error("bridge_cn.json missing leaderboard");

  const lb = leaderboard as Record<string, unknown>;
  const mmrMap = lb["mmr"];
  const displayNameMap = lb["display_name"] ?? lb["identity"];
  const identityMap = lb["identity"];
  const handlesMap = lb["handles"];
  const teamMap = lb["team_str"];

  const indices = Array.from(
    new Set([
      ...Object.keys((mmrMap && typeof mmrMap === "object" ? (mmrMap as any) : {}) as Record<string, unknown>),
      ...Object.keys((displayNameMap && typeof displayNameMap === "object" ? (displayNameMap as any) : {}) as Record<string, unknown>),
    ]),
  ).filter((k) => k.trim().length > 0);

  const entries: LeaderboardEntry[] = [];
  for (const idx of indices) {
    const mmr = toNumber(readIndexValue(mmrMap, idx));
    if (mmr == null) continue;

    const displayName = toStringSafe(readIndexValue(displayNameMap, idx)).trim();
    if (!displayName) continue;

    const handles = toStringArray(readIndexValue(handlesMap, idx));
    const teamVal = toNumber(readIndexValue(teamMap, idx)) ?? 0;
    const isKerrigan = teamVal === 1;
    const team_key: LeaderboardEntry["team_key"] = isKerrigan ? "kerrigan" : "survivor";
    const team_name: LeaderboardEntry["team_name"] = isKerrigan ? "凯瑞甘" : "幸存者";
    const identity = toStringSafe(readIndexValue(identityMap, idx)).trim();
    entries.push({
      display_name: displayName,
      handles,
      mmr,
      team_key,
      team_name,
      identity,
      tie: identity || displayName,
    });
  }

  function sortBoard(list: LeaderboardEntry[]) {
    return list.sort((a, b) => {
      if (b.mmr !== a.mmr) return b.mmr - a.mmr;
      return a.tie.localeCompare(b.tie, "zh-CN");
    });
  }

  const kerrigan = sortBoard(entries.filter((e) => e.team_key === "kerrigan")).slice(0, 50);
  const survivor = sortBoard(entries.filter((e) => e.team_key === "survivor")).slice(0, 50);

  return {
    generated_at: generatedAt,
    boards: {
      kerrigan: kerrigan.map((e, i) => ({
        rank: i + 1,
        display_name: e.display_name,
        identity: e.identity,
        handles: e.handles,
        mmr: e.mmr,
        team_name: "凯瑞甘",
      })),
      survivor: survivor.map((e, i) => ({
        rank: i + 1,
        display_name: e.display_name,
        identity: e.identity,
        handles: e.handles,
        mmr: e.mmr,
        team_name: "幸存者",
      })),
    },
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return jsonError(405, "Method Not Allowed");
    }

    // API: 积分查询（同域代理）
    if (pathname === "/api/credits") {
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

    // API: 排行榜数据（从 KV 读取 bridge_cn.json，并裁剪重组）
    if (pathname === "/api/leaderboard") {
      if (!env.KS_KV || typeof (env.KS_KV as any).get !== "function") {
        return jsonError(500, "KV binding missing: KS_KV");
      }

      const cacheKey = new Request(url.toString(), { method: "GET" });
      const cached = await defaultCache().match(cacheKey);
      if (cached) return cached;

      const key = "bridge_cn.json";
      const body = await env.KS_KV.get(key, "text");
      if (!body) return jsonError(404, `KV key not found: ${key}`);

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return jsonError(500, `KV key JSON parse error: ${key}`);
      }

      let payload: unknown;
      try {
        payload = computeLeaderboard(parsed);
      } catch (e) {
        return jsonError(500, (e instanceof Error ? e.message : "bridge_cn.json format error") || "bridge_cn.json format error");
      }

      const headers = new Headers();
      headers.set("Content-Type", "application/json; charset=utf-8");
      headers.set("Cache-Control", "public, max-age=30");
      const resp = withCors(new Response(JSON.stringify(payload), { status: 200, headers }));
      ctx.waitUntil(defaultCache().put(cacheKey, resp.clone()));
      return resp;
    }

    // API: 钻石议会投票数据（从 KV 读取）
    if (pathname === "/api/proposal_votes_cn.json") {
      if (!env.KS_KV || typeof (env.KS_KV as any).get !== "function") {
        return jsonError(500, "KV binding missing: KS_KV");
      }

      const key = "proposal_votes_cn.json";
      const body = await env.KS_KV.get(key, "text");
      if (!body) return jsonError(404, `KV key not found: ${key}`);

      const headers = new Headers();
      headers.set("Content-Type", "application/json; charset=utf-8");
      headers.set("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=60");
      return withCors(new Response(body, { status: 200, headers }));
    }

    const accept = request.headers.get("Accept") || "";
    const isHtml = accept.includes("text/html");
    const secFetchMode = request.headers.get("Sec-Fetch-Mode") || "";
    const secFetchDest = request.headers.get("Sec-Fetch-Dest") || "";
    const isNavigate = secFetchMode === "navigate" || secFetchDest === "document";
    const looksLikeFile = pathname.includes(".") || pathname.startsWith("/assets/");

    // SPA 路由回退 + 未知路由重定向
    // - 已知路由：直接回退 index.html（支持直接输入 URL 访问）
    // - 未知路由：重定向到首页
    if ((isHtml || isNavigate) && !looksLikeFile && !pathname.startsWith("/api/")) {
      const normalized = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
      const knownRoutes = new Set<string>(["/", "/council", "/leaderboard"]);
      if (knownRoutes.has(normalized)) {
        const indexUrl = new URL("/index.html", url);
        return env.ASSETS.fetch(new Request(indexUrl.toString(), { method: "GET" }));
      }

      return Response.redirect(new URL("/", url).toString(), 302);
    }

    // 静态资源：交给 Wrangler assets
    return env.ASSETS.fetch(request);
  },
};

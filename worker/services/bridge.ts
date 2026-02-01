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

export function computeLeaderboard(rawJson: unknown): {
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
      ...Object.keys(
        (displayNameMap && typeof displayNameMap === "object" ? (displayNameMap as any) : {}) as Record<string, unknown>,
      ),
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

export type PlayerRoleRow = {
  role_id: number;
  role_name: string;
  team_name: "幸存者" | "凯瑞甘";
  core_mmr: number;
  class_mmr: number;
  mmr: number;
  wins: number;
  plays: number;
  win_rate: number | null;
};

export function computePlayerRoles(
  rawJson: unknown,
  playerHandle: string,
): {
  generated_at: string;
  player_handle: string;
  cores: { survivor: number; kerrigan: number };
  ranks?: {
    survivor: { percentile: number; tier: "青铜" | "白银" | "黄金" | "白金" | "钻石" | "大师" };
    kerrigan: { percentile: number; tier: "青铜" | "白银" | "黄金" | "白金" | "钻石" | "大师" };
  };
  leaderboard_match?: {
    team_name: "幸存者" | "凯瑞甘";
    rank: number;
    mmr: number;
    identity: string;
    display_name: string;
  };
  top_uploader?: {
    name: string;
    num_uploads: number;
  };
  roles_survivor: PlayerRoleRow[];
  roles_kerrigan: PlayerRoleRow[];
} | null {
  if (!rawJson || typeof rawJson !== "object") throw new Error("bridge_cn.json format error");
  const obj = rawJson as Record<string, unknown>;

  const generatedAt = obj["generated_at"];
  if (typeof generatedAt !== "string" || !generatedAt.trim()) throw new Error("bridge_cn.json missing generated_at");

  const mmrInject = obj["mmr_inject"];
  if (!mmrInject || typeof mmrInject !== "object") throw new Error("bridge_cn.json missing mmr_inject");

  const playerRec = (mmrInject as Record<string, unknown>)[playerHandle];
  if (!playerRec) return null;
  if (typeof playerRec !== "object" || Array.isArray(playerRec)) throw new Error("mmr_inject record format error");
  const pr = playerRec as Record<string, unknown>;

  const coresMap = pr["cores"];
  const coreSurvivor = toNumber(readIndexValue(coresMap, "0"));
  const coreKerrigan = toNumber(readIndexValue(coresMap, "1"));
  if (coreSurvivor == null || coreKerrigan == null) throw new Error("mmr_inject record missing cores");

  const rolesMap = pr["roles"];
  const winsMap = pr["wins"];
  const playsMap = pr["plays"];

  const roleIdToName = obj["role_id_to_name"];
  const roleIdToTeam = obj["role_id_to_team"];
  if (!roleIdToName || typeof roleIdToName !== "object") throw new Error("bridge_cn.json missing role_id_to_name");
  if (!roleIdToTeam || typeof roleIdToTeam !== "object") throw new Error("bridge_cn.json missing role_id_to_team");

  const ids = Array.from(
    new Set([
      ...Object.keys(roleIdToName as Record<string, unknown>),
      ...Object.keys((rolesMap && typeof rolesMap === "object" ? (rolesMap as any) : {}) as Record<string, unknown>),
      ...Object.keys((playsMap && typeof playsMap === "object" ? (playsMap as any) : {}) as Record<string, unknown>),
    ]),
  )
    .map((x) => x.trim())
    .filter(Boolean);

  const rolesSurvivor: PlayerRoleRow[] = [];
  const rolesKerrigan: PlayerRoleRow[] = [];

  for (const roleIdStr of ids) {
    const roleId = toNumber(roleIdStr);
    if (roleId == null) continue;

    const roleName = toStringSafe(readIndexValue(roleIdToName, roleIdStr)).trim();
    if (!roleName) continue;

    const teamVal = toNumber(readIndexValue(roleIdToTeam, roleIdStr));
    if (teamVal == null) continue;
    const isSurvivor = teamVal === 0;
    const teamName: PlayerRoleRow["team_name"] = isSurvivor ? "幸存者" : "凯瑞甘";
    const coreMmr = isSurvivor ? coreSurvivor : coreKerrigan;

    const classMmr = toNumber(readIndexValue(rolesMap, roleIdStr)) ?? 0;
    const wins = toNumber(readIndexValue(winsMap, roleIdStr)) ?? 0;
    const plays = toNumber(readIndexValue(playsMap, roleIdStr)) ?? 0;

    if (!(plays > 0 || classMmr !== 0)) continue;

    const mmr = coreMmr + classMmr;
    const winRate = plays > 0 ? wins / plays : null;
    const row: PlayerRoleRow = {
      role_id: roleId,
      role_name: roleName,
      team_name: teamName,
      core_mmr: coreMmr,
      class_mmr: classMmr,
      mmr,
      wins,
      plays,
      win_rate: winRate,
    };

    (isSurvivor ? rolesSurvivor : rolesKerrigan).push(row);
  }

  function sortRows(a: PlayerRoleRow, b: PlayerRoleRow) {
    if (b.mmr !== a.mmr) return b.mmr - a.mmr;
    return a.role_name.localeCompare(b.role_name, "en");
  }

  rolesSurvivor.sort(sortRows);
  rolesKerrigan.sort(sortRows);

  function percentileForMmr(mmr: number, thresholds: number[]): number {
    // thresholds: length 101, increasing; return the highest p where mmr >= thresholds[p]
    let best = 0;
    for (let p = 0; p < thresholds.length; p++) {
      const t = thresholds[p];
      if (typeof t !== "number" || !Number.isFinite(t)) continue;
      if (mmr >= t) best = p;
    }
    return Math.max(0, Math.min(100, best));
  }

  function tierForPercentile(p: number): "青铜" | "白银" | "黄金" | "白金" | "钻石" | "大师" {
    // 口径：>= 下界进入更高段位
    // Bronze [0,25), Silver [25,50), Gold [50,75), Platinum [75,95), Diamond [95,99), Master [99,100]
    if (p >= 99) return "大师";
    if (p >= 95) return "钻石";
    if (p >= 75) return "白金";
    if (p >= 50) return "黄金";
    if (p >= 25) return "白银";
    return "青铜";
  }

  let ranks:
    | {
        survivor: { percentile: number; tier: ReturnType<typeof tierForPercentile> };
        kerrigan: { percentile: number; tier: ReturnType<typeof tierForPercentile> };
      }
    | undefined;
  const mmrPercentile = obj["mmr_percentile"];
  if (mmrPercentile && typeof mmrPercentile === "object") {
    const mp = mmrPercentile as Record<string, unknown>;
    const surv = mp["Survivor"];
    const kerri = mp["Kerrigan"];
    if (Array.isArray(surv) && Array.isArray(kerri) && surv.length >= 101 && kerri.length >= 101) {
      const pSurv = percentileForMmr(coreSurvivor, surv as number[]);
      const pKerri = percentileForMmr(coreKerrigan, kerri as number[]);
      ranks = {
        survivor: { percentile: pSurv, tier: tierForPercentile(pSurv) },
        kerrigan: { percentile: pKerri, tier: tierForPercentile(pKerri) },
      };
    }
  }

  // NOTE: 对齐 /api/leaderboard：复用 computeLeaderboard 的 Top50 结果，不自己单独排序/排名。
  let leaderboardMatch:
    | {
        team_name: "幸存者" | "凯瑞甘";
        rank: number;
        mmr: number;
        identity: string;
        display_name: string;
      }
    | undefined;
  try {
    const lb = computeLeaderboard(rawJson);
    for (const row of lb.boards.survivor) {
      if (row.handles.includes(playerHandle)) {
        leaderboardMatch = {
          team_name: "幸存者",
          rank: row.rank,
          mmr: row.mmr,
          identity: row.identity,
          display_name: row.display_name,
        };
        break;
      }
    }
    if (!leaderboardMatch) {
      for (const row of lb.boards.kerrigan) {
        if (row.handles.includes(playerHandle)) {
          leaderboardMatch = {
            team_name: "凯瑞甘",
            rank: row.rank,
            mmr: row.mmr,
            identity: row.identity,
            display_name: row.display_name,
          };
          break;
        }
      }
    }
  } catch {
    // ignore: leaderboard mismatch shouldn't break /player
  }

  let topUploader:
    | {
        name: string;
        num_uploads: number;
      }
    | undefined;
  const topUploaders = obj["top_uploaders"];
  if (topUploaders && typeof topUploaders === "object") {
    const tu = topUploaders as Record<string, unknown>;
    const nameMap = tu["name"];
    const handleMap = tu["player_handle"];
    const numMap = tu["num_uploads"];
    if (nameMap && handleMap && numMap) {
      const indices = Object.keys((handleMap && typeof handleMap === "object" ? (handleMap as any) : {}) as Record<string, unknown>);
      for (const idx of indices) {
        const handles = toStringArray(readIndexValue(handleMap, idx));
        if (!handles.includes(playerHandle)) continue;
        const name = toStringSafe(readIndexValue(nameMap, idx)).trim();
        const numUploads = toNumber(readIndexValue(numMap, idx)) ?? 0;
        if (name) {
          topUploader = { name, num_uploads: numUploads };
          break;
        }
      }
    }
  }

  return {
    generated_at: generatedAt,
    player_handle: playerHandle,
    cores: { survivor: coreSurvivor, kerrigan: coreKerrigan },
    ...(ranks ? { ranks } : {}),
    ...(leaderboardMatch ? { leaderboard_match: leaderboardMatch } : {}),
    ...(topUploader ? { top_uploader: topUploader } : {}),
    roles_survivor: rolesSurvivor,
    roles_kerrigan: rolesKerrigan,
  };
}

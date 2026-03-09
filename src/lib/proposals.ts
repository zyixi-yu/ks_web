import { formatTimeCN } from "./time";

export type ProposalVote = {
  voter_battle_tag?: string;
  vote?: number;
  voter_rank?: string;
  created_at?: string;
};

export type Proposal = {
  proposal_id: number;
  title?: string;
  description?: string;
  proposer_name?: string;
  created_at?: string;
  closed_at?: string | null;
  close_reason?: string | null;
  claimed_by_snowflake?: number | null;
  implemented_at?: string | null;
  implemented_version?: string | null;
  votes?: ProposalVote[];
};

export type ProposalVotesPayload = {
  generated_at?: string;
  proposals?: Proposal[];
};

export const PROPOSAL_RULES = {
  decisionAfterDays: 14,
  quorumDeadlineDays: 30,
  quorumVotes: 10,
  passThreshold: 0.75,
} as const;

export type ProposalStatus =
  | "Active"
  | "Expired"
  | "Rejected"
  | "Closed"
  | "Passed (Pending Implementation)"
  | "Implemented";

export function weightForRank(rank: string | null | undefined): number {
  const norm = String(rank || "").trim().toLowerCase();
  if (norm === "grandmaster") return 3;
  if (norm === "master") return 2;
  if (norm === "diamond") return 1;
  return 0;
}

export function normalizeVoteValue(vote: unknown): 0 | 1 {
  if (vote === 1 || vote === true || vote === "1") return 1;
  if (vote === 0 || vote === false || vote === "0") return 0;
  if (vote === -1 || vote === "-1") return 0;
  return 0;
}

export type LatestVoteRow = {
  voter: string;
  vote: 0 | 1;
  rank: string;
  weight: number;
  createdAt: string | null;
  t: number;
};

export function computeVoteStats(votes: ProposalVote[] | null | undefined) {
  const rows = Array.isArray(votes) ? votes : [];
  const latestByVoter = new Map<string, LatestVoteRow>();

  for (const row of rows) {
    const voter = String(row?.voter_battle_tag || "").trim() || "Unknown";
    const createdAt = row?.created_at || null;
    const t = Date.parse(createdAt || "") || 0;
    const prev = latestByVoter.get(voter);
    if (!prev || t > prev.t) {
      latestByVoter.set(voter, {
        voter,
        vote: normalizeVoteValue(row?.vote),
        rank: String(row?.voter_rank || "").trim() || "Unknown",
        weight: weightForRank(row?.voter_rank),
        createdAt,
        t,
      });
    }
  }

  const latestVotes = Array.from(latestByVoter.values()).sort((a, b) => (b.t || 0) - (a.t || 0));
  const voteCount = latestVotes.length;

  let yesWeight = 0;
  let noWeight = 0;
  let yesCount = 0;
  let noCount = 0;
  for (const v of latestVotes) {
    if (v.vote === 1) {
      yesWeight += v.weight;
      yesCount += 1;
    } else {
      noWeight += v.weight;
      noCount += 1;
    }
  }

  const totalWeight = yesWeight + noWeight;
  const approvalRate = totalWeight > 0 ? yesWeight / totalWeight : 0;
  const approvalPct = Math.round(approvalRate * 100);

  return {
    voteCount,
    yesWeight,
    noWeight,
    totalWeight,
    approvalRate,
    approvalPct,
    yesCount,
    noCount,
    latestVotes,
  };
}

export function addDays(iso: string | null | undefined, days: number): string | null {
  const t = Date.parse(String(iso || ""));
  if (!t) return null;
  return new Date(t + days * 24 * 60 * 60 * 1000).toISOString();
}

export function computeProposalStatus(args: {
  createdAt: string | null;
  closedAt: string | null;
  implementedAt: string | null;
  voteCount: number;
  approvalRate: number;
}): ProposalStatus {
  const now = Date.now();
  const createdT = Date.parse(args.createdAt || "") || 0;

  if (args.implementedAt) return "Implemented";
  if (args.closedAt) return "Closed";
  if (!createdT) return "Active";

  const quorumDeadlineT = createdT + PROPOSAL_RULES.quorumDeadlineDays * 24 * 60 * 60 * 1000;
  const decisionAtT = createdT + PROPOSAL_RULES.decisionAfterDays * 24 * 60 * 60 * 1000;

  if (now >= quorumDeadlineT && args.voteCount < PROPOSAL_RULES.quorumVotes) return "Expired";
  if (now >= decisionAtT && args.voteCount >= PROPOSAL_RULES.quorumVotes) {
    if (args.approvalRate > PROPOSAL_RULES.passThreshold) return "Passed (Pending Implementation)";
    return "Rejected";
  }
  return "Active";
}

export function statusPresentation(status: ProposalStatus) {
  const map: Record<
    ProposalStatus,
    { zh: string; cls: string; emoji: string }
  > = {
    Active: { zh: "进行中", cls: "active", emoji: "🟢" },
    Expired: { zh: "已过期", cls: "expired", emoji: "⚪" },
    Rejected: { zh: "已否决", cls: "rejected", emoji: "🔴" },
    Closed: { zh: "已关闭", cls: "closed", emoji: "⚫" },
    "Passed (Pending Implementation)": { zh: "已通过", cls: "passed", emoji: "🟣" },
    Implemented: { zh: "已实施", cls: "implemented", emoji: "✅" },
  };
  return map[status];
}

export function proposalMetaText(proposal: Proposal) {
  const created = proposal.created_at ? formatTimeCN(proposal.created_at) : "--";
  const parts = [
    `发起人：${proposal.proposer_name || "未知"}`,
    `创建：${created}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { copyToClipboard } from "../lib/clipboard";
import { formatTimeCN } from "../lib/time";
import {
  PROPOSAL_RULES,
  computeProposalStatus,
  computeVoteStats,
  proposalMetaText,
  statusPresentation,
  type LatestVoteRow,
  type Proposal,
  type ProposalVotesPayload,
} from "../lib/proposals";

function safeText(x: unknown, fallback = "--"): string {
  const s = String(x ?? "").trim();
  return s ? s : fallback;
}

function voteLine(row: LatestVoteRow): string {
  const isYes = row.vote === 1;
  const prefix = isYes ? "+" : "-";
  const voteWord = isYes ? "赞同" : "反对";
  const timeStr = row.createdAt ? formatTimeCN(row.createdAt) : "--";
  return `${prefix} ${row.voter}(${row.rank}) 权重${row.weight} · ${voteWord} · ${timeStr}`;
}

export default function Proposals() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ProposalVotesPayload | null>(null);

  const [voteModal, setVoteModal] = useState<null | { proposalId: number; voteValue: 0 | 1 }>(null);
  const [voteCopied, setVoteCopied] = useState(false);
  const [eligHandle, setEligHandle] = useState("");
  const [eligLoading, setEligLoading] = useState(false);
  const [eligResult, setEligResult] = useState<
    | null
    | {
        ok: boolean;
        title: string;
        details: string[];
      }
  >(null);
  const [logModal, setLogModal] = useState<
    null | {
      proposal: Proposal;
      status: string;
      statusZh: string;
      latestVotes: LatestVoteRow[];
    }
  >(null);

  useEffect(() => {
    if (!voteModal) return;
    setVoteCopied(false);
    setEligHandle("");
    setEligLoading(false);
    setEligResult(null);
  }, [voteModal]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        try {
          const res = await fetch("/api/proposal_votes_cn.json", {
            headers: { Accept: "application/json" },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as ProposalVotesPayload;
          if (cancelled) return;
          setPayload(data);
          return;
        } catch (e) {
          console.warn(e);
        }

        const res = await fetch("/proposal_votes_cn.json", {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ProposalVotesPayload;
        if (cancelled) return;
        setPayload(data);
      } catch (e) {
        console.warn(e);
        if (cancelled) return;
        setError("提案数据加载失败，请稍后刷新重试");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const proposals = useMemo(() => {
    const list = Array.isArray(payload?.proposals) ? payload!.proposals!.slice() : [];
    list.sort((a, b) => (Date.parse(b.created_at || "") || 0) - (Date.parse(a.created_at || "") || 0));
    return list;
  }, [payload]);

  const generatedAt = payload?.generated_at ? formatTimeCN(payload.generated_at) : "--";

  function computeEligibility(player: any): { ok: boolean; details: string[] } {
    const details: string[] = [];
    const ranks = player?.ranks;
    const survTier = typeof ranks?.survivor?.tier === "string" ? ranks.survivor.tier : null;
    const kerriTier = typeof ranks?.kerrigan?.tier === "string" ? ranks.kerrigan.tier : null;

    const diamondOrMaster = (tier: string | null) => tier === "钻石" || tier === "大师";
    const tiersOk = diamondOrMaster(survTier) && diamondOrMaster(kerriTier);
    details.push(`段位：幸存者 ${survTier || "未知"}，凯瑞甘 ${kerriTier || "未知"}`);

    const rolesSurv = Array.isArray(player?.roles_survivor) ? player.roles_survivor : [];
    const rolesKerri = Array.isArray(player?.roles_kerrigan) ? player.roles_kerrigan : [];
    const sumPlays = (arr: any[]) =>
      arr.reduce((acc, r) => acc + (typeof r?.plays === "number" && Number.isFinite(r.plays) ? r.plays : 0), 0);
    const totalPlays = sumPlays(rolesSurv) + sumPlays(rolesKerri);
    const playsOk = totalPlays > 200;
    details.push(`总有效对局：${totalPlays}`);

    if (!tiersOk) details.push("未满足：双阵营需要达到 钻石/大师");
    if (!playsOk) details.push("未满足：总有效对局需要 > 200");

    return { ok: tiersOk && playsOk, details };
  }

  async function verifyEligibility() {
    const val = eligHandle.trim();
    if (!val) {
      setEligResult({ ok: false, title: "请输入玩家句柄", details: [] });
      return;
    }
    if (val.length > 64) {
      setEligResult({ ok: false, title: "玩家句柄过长", details: [] });
      return;
    }

    setEligLoading(true);
    setEligResult(null);
    try {
      const res = await fetch(`/api/player?player_handle=${encodeURIComponent(val)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        if (res.status === 404) {
          setEligResult({
            ok: false,
            title: "未找到玩家数据（可能不活跃或暂未收录）",
            details: ["这里只支持活跃玩家。"],
          });
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      const r = computeEligibility(json);
      setEligResult({
        ok: r.ok,
        title: r.ok ? "通过资格校验" : "未通过资格校验",
        details: r.details,
      });
    } catch (e) {
      console.warn(e);
      setEligResult({ ok: false, title: "校验失败，请稍后再试", details: [] });
    } finally {
      setEligLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-lg font-black text-slate-900">钻石议会</h1>
            <p className="mt-1 text-sm text-slate-500">提案投票与日志（按创建时间排序）</p>
          </div>
          <div className="text-xs font-bold text-slate-500">数据更新：{generatedAt}</div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <div>
            <span className="font-black text-slate-900">投票资格</span>：钻石/大师（双阵营），总有效对局 &gt;
            200，近30天有效对局 ≥ 10。
          </div>
          <div className="mt-1">
            <span className="font-black text-slate-900">权重</span>：钻石=1，大师=2；<span className="font-black text-slate-900">规则</span>：创建后
            {PROPOSAL_RULES.decisionAfterDays}天且≥{PROPOSAL_RULES.quorumVotes}人投票进入裁决，赞同率 &gt;{" "}
            {Math.round(PROPOSAL_RULES.passThreshold * 100)}% 视为通过（待实施）；创建后{PROPOSAL_RULES.quorumDeadlineDays}
            天仍不足{PROPOSAL_RULES.quorumVotes}人投票则过期。
          </div>
          <div className="mt-1">
            <span className="font-black text-slate-900">投票方式</span>：在游戏内输入{" "}
            <span className="font-black text-slate-900">-vote 提案编号_1</span>（赞同）或{" "}
            <span className="font-black text-slate-900">-vote 提案编号_0</span>（反对）。
          </div>
        </div>

        {loading ? (
          <div className="mt-4 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          </div>
        ) : null}
        {error ? <div className="mt-3 text-sm leading-6 text-red-600">{error}</div> : null}

        {!loading && !error ? (
          proposals.length ? (
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {proposals.map((p) => {
              const voteStats = computeVoteStats(p.votes);
              const status = computeProposalStatus({
                createdAt: p.created_at || null,
                closedAt: p.closed_at || null,
                implementedAt: p.implemented_at || null,
                voteCount: voteStats.voteCount,
                approvalRate: voteStats.approvalRate,
              });
              const pres = statusPresentation(status);
              const isActive = status === "Active";
              const title = safeText(p.title, "(无标题)");
              const desc = safeText(p.description, "");
              const showFullLink = desc.trim().length > 120 || desc.includes("\n");

              const totalW = voteStats.totalWeight || 0;
              const yesPct = totalW > 0 ? (voteStats.yesWeight / totalW) * 100 : 0;
              const noPct = totalW > 0 ? (voteStats.noWeight / totalW) * 100 : 0;

              const extraParts: string[] = [];
              if (status === "Closed" && p.close_reason) extraParts.push(`关闭原因：${safeText(p.close_reason, "")}`);
              if (status === "Passed (Pending Implementation)" && p.claimed_by_snowflake)
                extraParts.push(`已认领：${safeText(p.claimed_by_snowflake, "")}`);
              if (status === "Implemented" && p.implemented_version)
                extraParts.push(`实施版本：${safeText(p.implemented_version, "")}`);

              const openLog = () => {
                setLogModal({
                  proposal: p,
                  status,
                  statusZh: pres.zh,
                  latestVotes: voteStats.latestVotes,
                });
              };

              return (
                <div
                  className="flex min-h-[260px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  key={p.proposal_id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-h-[40px] flex-1 text-sm font-black leading-5 text-slate-900 line-clamp-2">
                      #{p.proposal_id} · {title}
                    </div>
                    <div
                      className={[
                        "shrink-0 rounded-full border px-2.5 py-1 text-xs font-black",
                        pres.cls === "active" && "border-blue-200 bg-blue-50 text-blue-700",
                        pres.cls === "expired" && "border-slate-200 bg-slate-50 text-slate-600",
                        pres.cls === "rejected" && "border-red-200 bg-red-50 text-red-700",
                        pres.cls === "closed" && "border-slate-200 bg-slate-100 text-slate-900",
                        pres.cls === "passed" && "border-violet-200 bg-violet-50 text-violet-700",
                        pres.cls === "implemented" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {pres.emoji} {pres.zh}
                    </div>
                  </div>

                  <div className="mt-2 min-h-[40px] text-xs leading-5 text-slate-500 line-clamp-2">
                    {proposalMetaText(p)}
                  </div>
                  <div className="mt-2 min-h-[96px] whitespace-pre-line text-sm leading-6 text-slate-800 line-clamp-4">
                    {desc || <span className="text-slate-400">（无描述）</span>}
                  </div>
                  <div className="mt-1 flex h-5 items-center justify-end">
                    <button
                      type="button"
                      className={[
                        "text-xs font-black text-cyan-700 hover:text-cyan-800 hover:underline",
                        !showFullLink && "pointer-events-none opacity-0",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={openLog}
                      aria-label="查看全文"
                    >
                      查看全文
                    </button>
                  </div>

                  <div className="mt-3 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    <div className="flex h-2">
                      <div className="bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, yesPct))}%` }} />
                      <div className="bg-red-500" style={{ width: `${Math.max(0, Math.min(100, noPct))}%` }} />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                      进度：<span className="font-black text-slate-900">{voteStats.voteCount}</span>/{PROPOSAL_RULES.quorumVotes}人
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                      赞同率：<span className="font-black text-slate-900">{voteStats.approvalPct}%</span>
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                      ✅ 赞同权重：<span className="font-black text-slate-900">{voteStats.yesWeight}</span>
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                      ⛔ 反对权重：<span className="font-black text-slate-900">{voteStats.noWeight}</span>
                    </span>
                  </div>

                  {extraParts.length ? (
                    <div className="mt-2 text-xs leading-5 text-slate-500">{extraParts.join(" · ")}</div>
                  ) : null}

                  <div className="mt-auto pt-3">
                    <div className="flex flex-col gap-2">
                      {isActive ? (
                        <div className="flex gap-2">
                          <button
                            className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-black text-white hover:bg-emerald-700"
                            onClick={() => setVoteModal({ proposalId: p.proposal_id, voteValue: 1 })}
                          >
                            赞同
                          </button>
                          <button
                            className="flex-1 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-black text-white hover:bg-red-700"
                            onClick={() => setVoteModal({ proposalId: p.proposal_id, voteValue: 0 })}
                          >
                            反对
                          </button>
                        </div>
                      ) : null}

                      <button
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-black text-slate-900 hover:bg-slate-50"
                        onClick={openLog}
                      >
                        查看详情（投票记录 {voteStats.voteCount}）
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              暂无提案数据
            </div>
          )
        ) : null}

      <Modal
        open={!!voteModal}
        title="投票方法"
        onClose={() => {
          setVoteModal(null);
        }}
      >
        {voteModal ? (
          <>
            <div className="text-sm leading-6 text-slate-800">
              你选择了<strong>{voteModal.voteValue === 1 ? "赞同" : "反对"}</strong>提案 <strong>#{voteModal.proposalId}</strong>。
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-black text-slate-900">投票步骤（共 3 步）</div>
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
                <li>
                  复制指令：
                  <div className="mt-2 rounded-xl border border-slate-900 bg-slate-900 p-3 font-mono text-sm text-slate-50 break-all">
                    -vote {voteModal.proposalId}_{voteModal.voteValue}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-900 hover:bg-slate-50"
                      onClick={async () => {
                        const ok = await copyToClipboard(`-vote ${voteModal.proposalId}_${voteModal.voteValue}`);
                        setVoteCopied(ok);
                        if (ok) setTimeout(() => setVoteCopied(false), 1500);
                      }}
                    >
                      {voteCopied ? "已复制" : "点击复制指令"}
                    </button>
                  </div>
                </li>
                <li>在游戏内「比赛模式」的聊天中输入该指令并发送。</li>
                <li>
                  上传这局录像（录像时长至少 <span className="font-black text-slate-900">5 分钟</span>）。
                </li>
              </ol>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-black text-slate-900">验证投票资格（可选）</div>
              <div className="mt-2 text-xs leading-5 text-slate-500">输入玩家句柄 (Handle)，用于快速校验是否满足投票门槛。</div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  className="w-full flex-1 rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-600"
                  placeholder="例: 5-S2-1-10252842"
                  value={eligHandle}
                  onChange={(e) => setEligHandle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") verifyEligibility();
                  }}
                  autoComplete="off"
                />
                <button
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-70"
                  onClick={verifyEligibility}
                  disabled={eligLoading}
                >
                  {eligLoading ? "校验中..." : "校验资格"}
                </button>
              </div>

              {eligResult ? (
                <div
                  className={[
                    "mt-3 rounded-xl border p-3 text-sm",
                    eligResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700",
                  ].join(" ")}
                >
                  <div className="font-black">{eligResult.title}</div>
                  {eligResult.details.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                      {eligResult.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex justify-end">
              <button
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-900 hover:bg-slate-50"
                onClick={() => setVoteModal(null)}
              >
                关闭
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={!!logModal}
        title={logModal ? `提案详情 · #${logModal.proposal.proposal_id}` : "提案详情"}
        onClose={() => setLogModal(null)}
      >
        {logModal ? (
          <>
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-xs font-bold text-slate-500">标题</div>
                <div className="mt-1 text-sm font-black leading-6 text-slate-900">
                  {safeText(logModal.proposal.title, "(无标题)")}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-black text-slate-700">
                  状态：<span className="text-slate-900">{logModal.statusZh}</span>
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-black text-slate-700">
                  创建：{" "}
                  <span className="text-slate-900">
                    {logModal.proposal.created_at ? formatTimeCN(logModal.proposal.created_at) : "--"}
                  </span>
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-xs font-bold text-slate-500">提案描述</div>
                <div className="mt-1 max-h-[28vh] overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                  {safeText(logModal.proposal.description, "") || (
                    <span className="text-slate-400">（无描述）</span>
                  )}
                </div>
              </div>

              <div className="text-xs leading-5 text-slate-500">
                投票记录说明：此处展示的是每位玩家的最新投票（如有人改票，以最后一次为准）。
              </div>
            </div>

            <div className="mt-3 max-h-[55vh] overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-100">
              {logModal.latestVotes.length ? (
                logModal.latestVotes.map((row) => (
                  <div key={row.voter} className={row.vote === 1 ? "text-emerald-300" : "text-red-300"}>
                    {voteLine(row)}
                  </div>
                ))
              ) : (
                <div className="text-slate-400">暂无投票记录</div>
              )}
            </div>

            <div className="mt-3 flex justify-end">
              <button
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-900 hover:bg-slate-50"
                onClick={() => setLogModal(null)}
              >
                关闭
              </button>
            </div>
          </>
        ) : null}
      </Modal>
      </div>
    </div>
  );
}

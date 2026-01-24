import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { copyToClipboard } from "../lib/clipboard";
import { formatTimeCN } from "../lib/time";
import {
  PROPOSAL_RULES,
  addDays,
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
  const [logModal, setLogModal] = useState<
    null | {
      proposal: Proposal;
      status: string;
      statusZh: string;
      latestVotes: LatestVoteRow[];
    }
  >(null);

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

  return (
    <div className="card card-pad">
      <div className="section-title">
        <h2 className="h2">钻石议会 · 提案投票</h2>
        <div className="small">数据更新：{generatedAt}</div>
      </div>

      <div className="rules">
        <div>
          <strong>投票资格</strong>：钻石/大师（双阵营），总有效对局 &gt; 200，近30天有效对局 ≥ 10。
        </div>
        <div>
          <strong>权重</strong>：钻石=1，大师=2；<strong>规则</strong>：创建后{PROPOSAL_RULES.decisionAfterDays}
          天且≥{PROPOSAL_RULES.quorumVotes}票进入裁决，赞同率 &gt;{" "}
          {Math.round(PROPOSAL_RULES.passThreshold * 100)}% 视为通过（待实施）；创建后{PROPOSAL_RULES.quorumDeadlineDays}
          天仍不足{PROPOSAL_RULES.quorumVotes}票则过期。
        </div>
        <div>
          <strong>投票方式</strong>：在游戏内输入 <strong>-vote 提案编号_1</strong>（赞同）或{" "}
          <strong>-vote 提案编号_0</strong>（反对）。
        </div>
      </div>

      {loading ? <div className="loader" /> : null}
      {error ? <div className="error">{error}</div> : null}

      {!loading && !error ? (
        proposals.length ? (
          <div className="proposal-grid">
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

              const totalW = voteStats.totalWeight || 0;
              const yesPct = totalW > 0 ? (voteStats.yesWeight / totalW) * 100 : 0;
              const noPct = totalW > 0 ? (voteStats.noWeight / totalW) * 100 : 0;

              const extraParts: string[] = [];
              if (status === "Closed" && p.close_reason) extraParts.push(`关闭原因：${safeText(p.close_reason, "")}`);
              if (status === "Passed (Pending Implementation)" && p.claimed_by_snowflake)
                extraParts.push(`已认领：${safeText(p.claimed_by_snowflake, "")}`);
              if (status === "Implemented" && p.implemented_version)
                extraParts.push(`实施版本：${safeText(p.implemented_version, "")}`);

              const decisionAt = p.created_at ? addDays(p.created_at, PROPOSAL_RULES.decisionAfterDays) : null;
              const quorumDeadlineAt = p.created_at ? addDays(p.created_at, PROPOSAL_RULES.quorumDeadlineDays) : null;

              return (
                <div className="proposal-card" key={p.proposal_id}>
                  <div className="proposal-topline">
                    <div className="proposal-title">
                      #{p.proposal_id} · {title}
                    </div>
                    <div className={`badge ${pres.cls}`}>{`${pres.emoji} ${pres.zh}`}</div>
                  </div>

                  <div className="proposal-meta">{proposalMetaText(p)}</div>
                  {desc ? <div className="proposal-desc">{desc}</div> : null}

                  <div className="progress" aria-label="投票进度">
                    <div className="progress-yes" style={{ width: `${Math.max(0, Math.min(100, yesPct))}%` }} />
                    <div className="progress-no" style={{ width: `${Math.max(0, Math.min(100, noPct))}%` }} />
                  </div>

                  <div className="pill-row">
                    <span className="pill">
                      进度：<strong>{voteStats.voteCount}</strong>/{PROPOSAL_RULES.quorumVotes}
                    </span>
                    <span className="pill">
                      赞同率：<strong>{voteStats.approvalPct}%</strong>
                    </span>
                    <span className="pill">
                      ✅ 赞同权重：<strong>{voteStats.yesWeight}</strong>
                    </span>
                    <span className="pill">
                      ⛔ 反对权重：<strong>{voteStats.noWeight}</strong>
                    </span>
                  </div>

                  {extraParts.length ? <div className="proposal-meta">{extraParts.join(" · ")}</div> : null}

                  {isActive ? (
                    <div className="actions">
                      <button className="btn btn-yes" onClick={() => setVoteModal({ proposalId: p.proposal_id, voteValue: 1 })}>
                        赞同
                      </button>
                      <button className="btn btn-no" onClick={() => setVoteModal({ proposalId: p.proposal_id, voteValue: 0 })}>
                        反对
                      </button>
                    </div>
                  ) : null}

                  <details className="details">
                    <summary>投票日志（{voteStats.voteCount}）</summary>
                    <div className="preview">
                      {voteStats.latestVotes.length ? (
                        <>
                          {voteStats.latestVotes.slice(0, 6).map((row) => (
                            <div key={row.voter}>
                              <span className={row.vote === 1 ? "plus" : "minus"}>{row.vote === 1 ? "+" : "-"}</span>{" "}
                              {row.voter}({row.rank}) 权重{row.weight} · {row.vote === 1 ? "赞同" : "反对"} ·{" "}
                              {row.createdAt ? formatTimeCN(row.createdAt) : "--"}
                            </div>
                          ))}
                          {voteStats.latestVotes.length > 6 ? <div className="muted">...</div> : null}
                        </>
                      ) : (
                        <div className="muted">暂无投票记录</div>
                      )}
                    </div>

                    <a
                      className="link"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setLogModal({
                          proposal: p,
                          status,
                          statusZh: pres.zh,
                          latestVotes: voteStats.latestVotes,
                        });
                      }}
                    >
                      在弹窗查看全部
                    </a>

                    <div className="proposal-meta" style={{ marginTop: 8 }}>
                      结束节点：裁决 {decisionAt ? formatTimeCN(decisionAt) : "--"} · 满票截止{" "}
                      {quorumDeadlineAt ? formatTimeCN(quorumDeadlineAt) : "--"}
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 14 }}>
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
            <p style={{ marginTop: 0, lineHeight: 1.6 }}>
              你选择了<strong>{voteModal.voteValue === 1 ? "赞同" : "反对"}</strong>提案{" "}
              <strong>#{voteModal.proposalId}</strong>。请在游戏聊天栏输入下面指令完成投票：
            </p>
            <div className="code" style={{ background: "#111827", borderColor: "#111827", color: "#f9fafb" }}>
              -vote {voteModal.proposalId}_{voteModal.voteValue}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                className="btn btn-copy"
                onClick={async () => {
                  await copyToClipboard(`-vote ${voteModal.proposalId}_${voteModal.voteValue}`);
                }}
                style={{ flex: 1, border: `1px solid var(--border)` }}
              >
                点击复制指令
              </button>
              <button className="btn" onClick={() => setVoteModal(null)} style={{ flex: 1, border: `1px solid var(--border)` }}>
                我知道了
              </button>
            </div>
            <p style={{ marginTop: 12, color: "var(--text-sub)", fontSize: 13, lineHeight: 1.6 }}>
              格式：<strong>-vote 提案编号_1</strong>（赞同） 或 <strong>-vote 提案编号_0</strong>（反对）。<br />
              说明：<strong>1</strong> 表示赞同，<strong>0</strong> 表示反对，<strong>_</strong> 是英文下划线。
            </p>
          </>
        ) : null}
      </Modal>

      <Modal
        open={!!logModal}
        title={logModal ? `投票日志 · #${logModal.proposal.proposal_id}` : "投票日志"}
        onClose={() => setLogModal(null)}
      >
        {logModal ? (
          <>
            <div style={{ color: "var(--text-sub)", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-line" }}>
              {`标题：${safeText(logModal.proposal.title, "(无标题)")}\n状态：${logModal.statusZh}（${logModal.status}） · 创建：${
                logModal.proposal.created_at ? formatTimeCN(logModal.proposal.created_at) : "--"
              }\n说明：此处展示的是每位玩家的最新投票（如有人改票，以最后一次为准）。`}
            </div>

            <div className="logbox" style={{ marginTop: 12 }}>
              {logModal.latestVotes.length ? (
                logModal.latestVotes.map((row) => (
                  <div key={row.voter} className={row.vote === 1 ? "plus" : "minus"}>
                    {voteLine(row)}
                  </div>
                ))
              ) : (
                <div className="muted">暂无投票记录</div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" style={{ border: `1px solid var(--border)` }} onClick={() => setLogModal(null)}>
                关闭
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

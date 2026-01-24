import React, { useMemo, useState } from "react";
import { copyToClipboard } from "../lib/clipboard";
import { computeCreditBreakdown, decodeCreditCode, type CreditsResponse } from "../lib/credits";
import { formatTimeCN } from "../lib/time";

type CreditsResult = {
  data: CreditsResponse;
  decoded: { amount: number; lucy_credits: number };
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

export default function CreditsQuery() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreditsResult | null>(null);
  const [copied, setCopied] = useState(false);

  const command = useMemo(() => {
    if (!result?.data?.code) return "";
    return `-lucy ${result.data.code}`;
  }, [result]);

  const breakdown = useMemo(() => {
    if (!result) return null;
    return computeCreditBreakdown(result.data, result.decoded);
  }, [result]);

  async function fetchCredits() {
    const val = handle.trim();
    if (!val) {
      setError("请输入玩家句柄");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/credits?player_handle=${encodeURIComponent(val)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CreditsResponse;
      if (!isNonEmptyString(data?.code)) throw new Error("返回数据格式错误或玩家不存在");
      const decoded = decodeCreditCode(data.code);
      setResult({ data, decoded });
    } catch (e) {
      console.warn(e);
      setError("查询失败。请检查句柄是否正确（如：5-S2-1-xxxxx），或稍后再试。");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card card-pad" style={{ maxWidth: 600, margin: "0 auto" }}>
      <h1 className="h1">凯瑞甘生存 · 积分助手</h1>
      <p className="sub">输入玩家句柄 (Handle) 查询积分与指令</p>

      <div className="row" style={{ marginTop: 14 }}>
        <input
          className="input"
          placeholder="例: 5-S2-1-10252842"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") fetchCredits();
          }}
          autoComplete="off"
        />
        <button className="btn btn-primary" onClick={fetchCredits} disabled={loading}>
          {loading ? "查询中..." : "查询"}
        </button>
      </div>

      {loading ? <div className="loader" /> : null}
      {error ? <div className="error">{error}</div> : null}

      {result ? (
        <div style={{ marginTop: 16 }}>
          <div className="command-card">
            <span className="command-label">游戏内领取指令</span>
            <div className="code">{command}</div>
            <button
              className="btn btn-copy"
              onClick={async () => {
                if (!command) return;
                const ok = await copyToClipboard(command);
                setCopied(ok);
                setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? "复制成功!" : "点击一键复制"}
            </button>
          </div>

          <div className="grid2" style={{ marginTop: 16 }}>
            <div className="card card-pad">
              <div className="stat-title">账号总积分 (存档恢复)</div>
              <div className="stat-value">{result.decoded.amount.toLocaleString()}</div>
              <div className="formula">若存档丢失会根据此分进行恢复</div>
            </div>

            <div className="card card-pad">
              <div className="stat-title">总奖励积分</div>
              <div className="stat-value highlight">{result.decoded.lucy_credits.toLocaleString()}</div>

              <div className="formula">
                <div className="formula-row">
                  <span>录像上传奖励</span>
                  <span style={{ fontWeight: 800 }}>
                    {breakdown ? `${breakdown.replays}局 × 2 = ${breakdown.replays * 2}` : "-"}
                  </span>
                </div>
                <div className="formula-row">
                  <span>离场扣分（作为凯瑞甘队伍，9分钟前离场）</span>
                  <span style={{ fontWeight: 800, color: "#dc2626" }}>
                    {breakdown ? (breakdown.penalty > 0 ? `-${breakdown.penalty * 10}` : "无") : "-"}
                  </span>
                </div>
                <div className="formula-row">
                  <span>额外积分奖励</span>
                  <span style={{ fontWeight: 800 }}>
                    {breakdown
                      ? breakdown.bonus !== 0
                        ? breakdown.bonus > 0
                          ? `+${breakdown.bonus}`
                          : `${breakdown.bonus}`
                        : "0"
                      : "-"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="meta" style={{ marginTop: 16 }}>
            <span>
              请注意：数据最后更新于{" "}
              <strong>
                {typeof result.data.updated === "number"
                  ? formatTimeCN(result.data.updated * 1000)
                  : "--"}
              </strong>{" "}
              (若刚上传录像请稍后刷新)
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}


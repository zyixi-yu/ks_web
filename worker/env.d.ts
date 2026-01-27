export {};

declare global {
  interface Env {
    // Wrangler 会为 assets.directory 注入 ASSETS（静态资源 Fetcher）
    ASSETS: Fetcher;

    // 存储钻石议会投票数据（proposal_votes_cn.json）
    KS_KV: KVNamespace;
  }
}

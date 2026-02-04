export {};

declare global {
  interface Env {
    // Wrangler 会为 assets.directory 注入 ASSETS（静态资源 Fetcher）
    ASSETS: Fetcher;

    // 存储钻石议会投票数据（proposal_votes_cn.json）
    KS_KV: KVNamespace;

    // 短信验证码读写鉴权 token（Authorization: <token> 或 Authorization: Bearer <token>）
    VERIFY_CODE_TOKEN?: string;

    // 配置读写鉴权 token：复用 VERIFY_CODE_TOKEN（Authorization: <token> 或 Authorization: Bearer <token>）
  }
}

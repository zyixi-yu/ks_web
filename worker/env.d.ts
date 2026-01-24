export {};

declare global {
  interface Env {
    // Wrangler 会为 assets.directory 注入 ASSETS（静态资源 Fetcher）
    ASSETS: Fetcher;
  }
}


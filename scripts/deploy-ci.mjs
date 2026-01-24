import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function firstEnv(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

const productionBranch = firstEnv("PRODUCTION_BRANCH") || "main";
const branch =
  firstEnv(
    // Cloudflare (Pages/Workers builds often reuse these)
    "CF_PAGES_BRANCH",
    "CF_BRANCH",
    // GitHub Actions
    "GITHUB_REF_NAME",
    // GitLab CI
    "CI_COMMIT_BRANCH",
    // Generic
    "BRANCH",
  ) || productionBranch;

const isProd = branch === productionBranch;
console.log(`[deploy-ci] branch=${branch} productionBranch=${productionBranch} isProd=${isProd}`);

run("pnpm", ["build"]);
run("wrangler", ["deploy", ...(isProd ? [] : ["--env", "preview"])]);


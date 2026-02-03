# Repository Guidelines

## Project Structure & Module Organization

- `src/`: React + TypeScript SPA (pages/components in `src/components/`, shared helpers in `src/lib/`, Tailwind styles in `src/index.css`).
- `worker/`: Cloudflare Worker (Hono router) serving `/api/*` and static assets. Route handlers live under `worker/routes/`, shared services/helpers under `worker/services/` and `worker/utils/`.
- `public/`: Static assets served by Vite/Worker (e.g., icons, sample data files).
- `scripts/`: Small Node scripts for local tooling (e.g., generating mock KV data).
- `wrangler.jsonc`: Worker config (KV bindings, assets, routes).

## Build, Test, and Development Commands

Use `pnpm` (see `package.json` scripts):

- `pnpm dev`: Start Vite dev server (frontend).
- `pnpm dev:worker`: Start Worker locally via Wrangler (API + assets).
- `pnpm dev:worker:mock`: Run Worker with local mock KV (`worker/index.mock.ts`).
- `pnpm build`: Production build to `dist/`.
- `pnpm preview`: Preview Vite build locally.
- `pnpm typecheck`: TypeScript strict typecheck (`tsc --noEmit`).
- `pnpm deploy`: Build + deploy Worker to Cloudflare.

## Coding Style & Naming Conventions

- TypeScript strict mode is enabled (`tsconfig.json`); keep types explicit at module boundaries.
- Prefer small, focused modules: UI in `src/components/`, data fetching/parsing in `src/lib/`, Worker endpoints in `worker/routes/`.
- Naming: React components `PascalCase.tsx`, helpers `camelCase.ts`, constants `SCREAMING_SNAKE_CASE`.

## Testing Guidelines

- No dedicated test runner is configured yet. Validate changes with:
  - `pnpm typecheck`
  - Manual smoke tests against local dev (`/api/*`, key pages, mobile viewport).

## Commit & Pull Request Guidelines

- Current history has no strict commit convention. Prefer short, meaningful subjects (e.g., `fix: verify-code auth`, `ui: improve navbar`).
- PRs should include:
  - Summary of behavior changes
  - Screenshots/GIFs for UI updates (desktop + mobile)
  - Any related issue/feature link and rollout notes (if deploy-affecting)

## Security & Configuration Tips

- Do **not** commit secrets. Use Cloudflare secrets for sensitive values:
  - Example: `wrangler secret put VERIFY_CODE_TOKEN`
- KV is bound in `wrangler.jsonc` (e.g., `KS_KV`). Keep mock data under `worker/mock-data/` for local development only.

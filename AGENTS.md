# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed by pnpm workspaces and Turbo.
- `apps/`: application entry points — `web` (Next.js), `api` (Hono), `exporter`, `worker`.
- `packages/`: shared libraries — `db`, `schemas`, `ui`.
- `tests/`: e2e assets (HTTP requests in `tests/e2e`).
- `scripts/`: setup utilities (see `scripts/setup.sh`).
- `.github/`: CI workflows.
- Keep shared code in `packages/*`; avoid cross‑app relative imports.

## Build, Test, and Development Commands
- Setup: `pnpm setup` — materializes files from .md stubs and installs deps.
- Install: `corepack enable && corepack prepare pnpm@10.15.0 --activate && pnpm install`.
- Dev (all): `pnpm dev` — Turbo runs all app dev scripts.
  - Web only: `pnpm --filter @sme/web dev`
  - API only: `pnpm --filter @sme/api dev`
- Build: `pnpm build` (Turbo); Web Turbopack: `pnpm --filter @sme/web build:turbo`.
- Lint/Types: `pnpm lint` | `pnpm typecheck`.
- Format: `pnpm format` | Check: `pnpm format:check`.
- Infra (local DB/cache): `docker-compose up -d` (Postgres 16, Redis 7).
- Health check: `curl http://localhost:3001/health`.

## Coding Style & Naming Conventions
- Language: TypeScript‑first; Node >= 22.
- Formatting: Prettier — 2 spaces, single quotes, semicolons, trailing commas, width 100.
- Linting: ESLint v9 flat config (`eslint.config.mjs`) + Next plugin.
- Names: packages use `@sme/*` or `ui`; app scopes: `web`, `api`, `worker`, `exporter`.
- Paths: prefer `packages/*` for shared code; no cross‑app relative imports.

## Testing Guidelines
- Framework: none standardized yet; e2e checks via HTTP files in `tests/e2e`.
- Quick checks: `curl http://localhost:3001/health` or open `tests/e2e/api.http` in a REST client.
- Unit tests: add where introduced (Vitest/Jest welcome per package).
- Naming: colocate tests as `*.test.ts` or under `__tests__/`.
- Coverage: not enforced.

## Commit & Pull Request Guidelines
- Commits: imperative mood with scope, e.g., `api: add /snowflake/catalog endpoint`.
- Group small changes logically; keep diffs minimal.
- PRs: include description, linked issues, steps to test; screenshots/GIFs for UI.
- Gates: ensure `pnpm lint`, `pnpm typecheck`, and `pnpm -w build` pass locally.
- CI: runs Node 22/24, lint, typecheck, builds (see `.github/workflows/ci.yml`).

## Security & Configuration Tips
- Never commit secrets; base env on `.env.example` → `.env`.
- Web env exposed via `NEXT_PUBLIC_*`; server‑only secrets stay unprefixed.
- Postgres/Redis via `docker-compose.yml`; Snowflake creds required for API discovery.


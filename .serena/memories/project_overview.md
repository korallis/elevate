# SME Analytics – Project Overview

- Purpose: Monorepo for a small/medium enterprise analytics stack with a Next.js web app, an API (Hono), and background worker/exporter processes. Shared libraries for DB access, schemas, and UI components.
- Platform: Node >= 22, TypeScript-first monorepo managed by pnpm workspaces and Turbo.
- CI: Node 22/24; runs lint, typecheck, and builds.
- Services: Local Postgres 16 and Redis 7 via docker-compose.

## Tech Stack

- Monorepo: pnpm 10, Turbo 2.5
- Web: Next.js 15 (React 19), Tailwind CSS v4
- API: Hono + @hono/node-server, Zod; Snowflake SDK for discovery; pg for Postgres; node-cron for scheduled tasks
- Worker/Exporter: tsx entrypoints (Node scripts)
- Language/Tooling: TypeScript 5.9, ESLint 9 (flat config), Prettier 3

## Structure

- apps/
  - web: Next.js frontend (`@sme/web`)
  - api: Hono server (`@sme/api`)
  - exporter: Node script runner (`@sme/exporter`)
  - worker: background tasks (`@sme/worker`)
- packages/
  - db: shared DB helpers (`@sme/db`)
  - schemas: Zod schemas (`@sme/schemas`)
  - ui: shared UI components (`ui`)
- tests/: e2e HTTP assets
- scripts/: setup utilities (`setup.sh` to materialize files from .md stubs)

## Entrypoints

- Web: `pnpm --filter @sme/web dev` → Next dev (Turbopack)
- API: `pnpm --filter @sme/api dev` → Hono server on Node
- Exporter/Worker: `pnpm --filter @sme/exporter dev` / `pnpm --filter @sme/worker dev`
- All apps: `pnpm dev` (Turbo orchestrates per-package `dev`)

## Notes

- Formatting and linting are enforced via Prettier and ESLint flat config.
- Turbopack production build available via `pnpm --filter @sme/web build:turbo`.
- Environment variables: base from `.env.example` → `.env`. Web-exposed vars are `NEXT_PUBLIC_*`; keep secrets unprefixed.
- Infra: run `docker-compose up -d` to bring up Postgres and Redis locally.

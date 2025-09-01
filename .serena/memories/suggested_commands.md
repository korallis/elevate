# Suggested Commands

## Setup

- `corepack enable && corepack prepare pnpm@10.15.0 --activate` – activate pnpm via Corepack
- `pnpm install` – install dependencies (root + workspaces)
- `pnpm setup` – materialize files from .md stubs and attempt install

## Dev / Run

- `pnpm dev` – run all apps in dev via Turbo
- `pnpm --filter @sme/web dev` – Next.js dev (Turbopack)
- `pnpm --filter @sme/api dev` – Hono API dev server
- `pnpm --filter @sme/exporter dev` – run exporter script
- `pnpm --filter @sme/worker dev` – run worker script

## Build

- `pnpm build` – Turbo build all
- `pnpm --filter @sme/web build:turbo` – Turbopack production build (web)

## Quality

- `pnpm lint` – run ESLint (flat config)
- `pnpm typecheck` – TypeScript `--noEmit` checks
- `pnpm format` – Prettier write
- `pnpm format:check` – Prettier check only

## Infra

- `docker-compose up -d` – start Postgres 16 and Redis 7
- `docker-compose down -v` – stop and remove volumes

## Quick checks

- API health (once running): `curl http://localhost:3001/health` (adjust port if different)
- E2E assets: open `tests/e2e/api.http` in REST client

## Useful (Darwin/macOS)

- `ls`, `cd`, `rg` (ripgrep), `grep`, `sed`, `awk`, `pbcopy/pbpaste`
- `lsof -i :PORT` – find process on port; `kill -9 PID` to free it
- `docker ps`, `docker logs <container>` – inspect containers

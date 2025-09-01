# Elevate

Base monorepo scaffold with Next.js 15, React 19, and TypeScript 5.9.

## Quick Start

- Prereqs: Node 22+, pnpm via Corepack
- Install:
  - corepack enable
  - corepack prepare pnpm@10.15.0 --activate
  - pnpm -w install
- Run Web (dev):
  - pnpm --filter @sme/web dev
  - App: http://localhost:3000
  - Health: http://localhost:3000/api/health

## Workspace Scripts

- Dev: `pnpm --filter @sme/web dev`
- Build: `pnpm -w -r run -if-present build`
- Start: `pnpm --filter @sme/web start`
- Lint: `pnpm -w -r run -if-present lint`
- Typecheck: `pnpm -w -r run -if-present typecheck`
- Test: `pnpm -w -r run -if-present test`

## Environment

- Sample env: `apps/web/.env.example`
- Local env: copy to `apps/web/.env.local` and edit as needed

### Auth & Database

- Set `DATABASE_URL` (SQLite path) and iron-session secrets in `apps/web/.env.local`:
  - `DATABASE_URL="file:./prisma/dev.db"`
  - `IRON_SESSION_PASSWORD` (32+ chars)
  - `IRON_SESSION_COOKIE_NAME` (e.g. `elevate_session`)
- Generate Prisma client and apply schema:
  - `pnpm --filter @sme/web db:generate`
  - `pnpm --filter @sme/web db:push` (or `db:migrate` to create a migration)
- Start dev server and visit `/signup`, `/login`, and protected `/dashboard`.

## Project Layout

- apps/web: Next.js App Router app (15.x), strict TS, ESLint/Prettier
- docs: Architecture, ADRs, roadmap, security/governance

## CI

- GitHub Actions runs workspace scripts (lint/typecheck/build/test) when present.
- PR guardrails enforce Conventional Commits and a Closes #<issue> reference.

## References

- ADR Index: docs/adr/README.md
- Architecture & Stack: docs/adr/0001-architecture-and-stack.md
- DevOps & CI: docs/adr/0008-devops-repo-ci.md

# Elev8 – Multi-Connector Analytics Platform (2025 stack)

- Node: >= 22 (Active LTS)
- Package manager: pnpm 10.15.0 (via Corepack)
- Monorepo: Turbo 2.5.6 + pnpm workspaces
- Web: Next.js 15.5.2 + React 19.1.1
- TypeScript: 5.9.2
- Styling: Tailwind CSS 4.1.12 (`@tailwindcss/postcss`) + Autoprefixer 10.4.21
- Lint/Format: ESLint 9 (flat config) + Prettier 3

## Setup

1. Enable Corepack and activate pnpm

```
corepack enable
corepack prepare pnpm@10.15.0 --activate
```

2. Install dependencies

```
pnpm install
```

3. Run all apps in dev (Turbo)

```
pnpm dev
```

Per‑app:

- Web: `pnpm --filter @sme/web dev` (Turbopack dev)
- API: `pnpm --filter @sme/api dev`
- Exporter: `pnpm --filter @sme/exporter dev`
- Worker: `pnpm --filter @sme/worker dev`

## Supported Data Connectors

- **Data Warehouses**: Snowflake, BigQuery, Redshift, Databricks
- **Databases**: MS SQL Server, MySQL, PostgreSQL, Azure SQL
- **Business Apps**: Xero (Accounting), Salesforce (CRM), Spendesk (Finance)

## Key Features

- 🔄 **Animated Connector Switcher**: Dynamic hero section showcasing all supported data sources
- 🎨 **Modern Design System**: Glassmorphic UI with Tailwind CSS v4
- 🚀 **TypeScript 2025 Standards**: Strict mode, no `any` types, Zod validation
- 🔐 **Enterprise Security**: SOC2 Type II compliant, data never leaves source systems

## Lint / Typecheck / Format

```
pnpm lint
pnpm typecheck
pnpm prettier --write .
```

Notes:

- ESLint uses flat config at `eslint.config.mjs` and the Next.js plugin.
- Tailwind v4 uses `@tailwindcss/postcss` in `apps/web/postcss.config.js`.
- Turbopack production build is available via `pnpm --filter @sme/web build:turbo`.
- CI runs on Node 22 and 24 (see `.github/workflows/ci.yml`).
- Renovate keeps deps fresh (see `renovate.json`).

### Formatting & pre-commit hooks

- Root scripts: `pnpm format` and `pnpm format:check`.
- Pre-commit runs `lint-staged` (Prettier + ESLint on changed files).
- If hooks aren’t active locally, run `pnpm prepare` once.

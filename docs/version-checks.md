# Version Checks at Scaffold Time

Confirm the latest compatible versions with MCP servers and release notes before scaffolding. Record exact versions used in the initial commit message and in an ADR follow‑up if needed.

## Runtimes & Frameworks

- Node.js: 22.x LTS (current)
- Next.js: 15.x (App Router)
- React: 19.x
- TypeScript: 5.9.x

## UI & Styling

- Tailwind CSS: 4.1.x
- shadcn/ui: canary supporting Tailwind v4 + React 19

## Data & ORMs

- PostgreSQL server: 17.x
- ORM: Prisma 6.x (or Drizzle latest) – finalize via spike ADR note

## Connectors & SDKs

- Snowflake Node SDK (`snowflake-sdk`): 2.x
- Salesforce (`jsforce`): latest
- Xero (`xero-node`): latest
- Spendesk API: latest REST/OAuth/webhooks per vendor docs

## Visualization

- Vega‑Lite: 6.x
- Apache ECharts: latest stable

## AI

- Ollama: latest app/CLI supporting Llama 3.1 8B/70B
- OpenAI: Responses API (fallback), model version pinned per org policy

## CI & Tooling

- GitHub Actions runners compatible with Node 22 and pnpm/npm
- OpenTelemetry libs for tracing

## Checklist to Execute

1) Verify Node/Next/React/TS compatibility matrix.
2) Confirm Tailwind v4 + shadcn/ui canary integration.
3) Check Prisma 6.x or Drizzle latest for Node 22 support.
4) Confirm connector SDK versions and breaking changes (Snowflake 2.x, jsforce, xero-node, Spendesk docs).
5) Pin visualization libs (Vega‑Lite/ECharts) and licenses.
6) Validate Ollama + desired Llama model sizes on target hardware.
7) Capture final version pins in ADR 0001 follow‑up notes.


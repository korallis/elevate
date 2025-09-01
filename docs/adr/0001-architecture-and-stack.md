# ADR 0001: Architecture & Stack

Status: Accepted (confirm versions at scaffold time)

## Context

We must replace Power BI with a modern, web‑only analytics platform that automates mapping/ETL/dashboards while allowing manual expert workflows, with multi‑tenant security and responsive UX. We want current, widely supported technology with strong ecosystem and performance.

## Decision

- Web framework: Next.js (App Router) with React 19 for SSR/RSC and streaming.
- Runtime: Node.js 22 LTS.
- Styling/UI: Tailwind CSS v4.1 + shadcn/ui (React 19 + Tailwind v4 compatible).
- Metadata DB: PostgreSQL 17 for org/users/ACL/semantic models/mappings/pipelines/dashboards/logs.
- Warehouse: Snowflake as primary analytics engine; Postgres as a light alternative where Snowflake is unavailable.
- ORM: Prisma 6.x (or Drizzle latest) – finalize via a short spike; prefer Prisma for tooling breadth.
- Visualization: Vega‑Lite and/or Apache ECharts (decisions in ADR‑0005).
- Background jobs: Queue‑based workers initially (BullMQ/Redis); reassess Temporal later (ADR‑0006).
- AI: Local LLM via Ollama; OpenAI fallback (ADR‑0002).

## Consequences

- Mature developer experience and rapid iteration.
- Strong performance via server components and pre‑aggregations.
- Clear separation of metadata vs. analytics storage.
- Requires careful governance (RLS, versioning, audit) captured in ADR‑0007.

## Alternatives Considered

- Full open‑source BI (Superset/Metabase): good baseline but less auto‑mode integration and AI control.
- Pure serverless stack: reduces ops, but background processing and local AI need more control.

## Follow‑ups

- Confirm exact versions (docs/version-checks.md) at scaffold and pin in package manifests.
- Select ORM definitively (Prisma vs Drizzle) based on a spike.


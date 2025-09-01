# Elev8 – Engineering Backlog

Working agreement

- Single‑WIP: only one feature is In Progress at a time.
- Each feature is documented with scope, acceptance criteria, and DoD.
- Link PRs/issues to features; update status on merge.
- Prefer vertical slices with tests and docs; ship iteratively.

Legend: Status = Planned | Ready | In Progress | Blocked | Done

Templates

- Feature card fields: Title • Status • Owner • Summary • Problem • Scope • Out of Scope • Acceptance Criteria • Tech Notes • Dependencies • Risks • Metrics/DoD • Links

In Progress (1)

1) Exports: XLSX export endpoint
- Status: Done
- Notes: Streaming mode added (constant memory for large datasets), 50MB guardrail for non‑streaming, audit logging, metrics on success/failure, e2e request included.
- Owner: TBA
- Summary: Add XLSX export of tabular results alongside CSV, with streaming for large datasets.
- Problem: CSV exists; XLSX missing but listed in scope. Users need Excel-friendly exports.
- Scope: API route `/export/xlsx` that accepts rows/fields; Excel generation (exceljs); filename/content-disposition; audit log; basic cell typing; 50MB guardrail.
- Out of Scope: Pivot tables, charts, formatting beyond header bold and column widths.
- Acceptance Criteria:
  - POST `/export/xlsx` returns `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` payload.
  - Supports up to 200k rows with constant memory via streaming.
  - Header row + inferred types for numbers/booleans/dates.
  - Audit log row created on export; error paths logged.
  - Basic e2e check added in `tests/e2e/api.http.md` with note on manual verification.
- Tech Notes: Use `exceljs` stream writer; reuse CSV endpoint shape. Rate-limit via existing budget guardrails.
- Dependencies: None (library addition).
- Risks: Memory spikes if not streaming; large payload latency.
- Metrics/DoD: 200k rows in <90s locally; no process OOM; lints/typechecks pass.
- Links: PR #TBD

In Progress (1)

2) Observability: SLOs + alerting
- Status: In Progress
- Owner: TBA
- Summary: Define and track service SLOs (API p95 latency, exporter success rate) and page on error budget burn.
- Problem: Tracing exists; no SLOs/alerts to protect reliability.
- Scope: Prometheus `/metrics` exporter (API), histogram buckets for request latency; exporter success/failure counters; define 28‑day SLOs; add alert rules doc; baseline Grafana dashboard JSON.
- Out of Scope: Full paging integration rollout; worker OTel.
- Acceptance Criteria:
  - `/metrics` endpoint exposed and scraped locally.
  - SLOs documented with targets and error budgets; alert rules YAML checked in.
  - Dashboard shows API p50/p95/p99 and exporter success rate.
- Tech Notes: `@opentelemetry/exporter-prometheus` or `prom-client`; reuse tracing middleware timings.
- Dependencies: None.
- Risks: Metrics cardinality; resource overhead.
- Metrics/DoD: Prometheus shows metrics; rule fires under synthetic load.

Ready (Next Up)

3) API Docs: OpenAPI + Swagger UI
- Status: Ready
- Summary: Generate OpenAPI from existing zod validators; publish Swagger at `/docs`.
- Acceptance Criteria: Spec builds in CI; `/docs` loads; endpoints match implemented routes; versioned spec committed.

4) Testing: UI component unit tests (design system)
- Status: Ready
- Summary: Add Vitest + RTL tests for Button, Card, Input variants.
- Acceptance Criteria: 15+ assertions across components; CI job added.

5) Testing: Connector integration tests (guarded)
- Status: Ready
- Summary: Add opt‑in integration suite with env‑flag to run against dev DBs; minimal contract checks per connector.
- Acceptance Criteria: Skipped by default; doc for setup; Snowflake/Postgres happy paths covered.

6) CI/CD & Infra: IaC baseline
- Status: Ready
- Summary: Terraform/Pulumi for Postgres/Redis/dev env; secrets management doc.
- Acceptance Criteria: `infra/` with modules; a README to provision dev.

7) A11y & Performance hardening
- Status: Ready
- Summary: Run axe/lighthouse; add keyboard navigation, focus traps, reduced motion; dynamic imports for heavy components.
- Acceptance Criteria: Key pages pass WCAG AA checklist; measurable lighthouse improv.; focus traps in modals.

Backlog

- MCP Usage: VisionCraft stubs + ADR notes
- Dashboard builder improvements (post‑MVP polish)
- Worker OTel + spans for workflows

Done (Archive)

- Meta/tooling: Node/pnpm pinning; Turbo; ESLint/Prettier; Tailwind v4; CI; Turbopack; TypeScript strict; design system baseline and docs.
- MVP app: Landing page sections, auth flows, orgs/depts/workspaces, RBAC, sharing, audit logs.
- Connectors & catalog: 11 connectors registry, Snowflake discovery + persistence, catalog API/UI, freshness/ownership.
- ETL/Sync: Temporal worker & workflows, schedules, cron, SSE status, schema evolution, data quality checks, run history.
- Transformations & semantic: Aliases + mappings, semantic DSL, preview queries, versioning basics.
- Explore & NL→SQL: NL→SQL engine/guardrails, saved queries, budget guardrails, caching.
- Dashboards: Manual builder, prompt‑based auto‑gen, templates library.
- Exports & schedules: PDF/PNG exporter, CSV export, email/slack schedules.
- Governance & security: PII tagging/masking, RLS policies, GDPR flows, sharing scopes.
- Billing: Stripe billing, entitlements, usage meters.
- Observability: API tracing and middleware.

Notes

- Keep feature cards short and outcome‑focused; link PRs/issues.
- Revisit priorities weekly; maintain single WIP discipline.

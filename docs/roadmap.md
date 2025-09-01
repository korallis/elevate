# Roadmap & Milestones

## Sprint 0 – Planning & Docs (current)

- Finalize architecture and ADRs; define canonical model and NFRs.
- Prepare Sprint 0 backlog; repo reset plan; version check plan.

## v0.1 – Scaffold & Foundations (Internal Alpha)

- Scaffold Next.js app, auth, Postgres metadata, orgs/divisions, basic RBAC.
- Connector shells (auth only); Snowflake connectivity; minimal dashboard shell.
- CI setup and project conventions.

## v0.2 – ETL & Semantic Layer MVP

- Ingestion framework (incremental), mapping UI (manual), semantic definitions.
- Data catalog and lineage basics; quality checks; initial RLS.

## v0.3 – AI‑Assisted Mapping & Auto Dashboards

- AI schema mapping proposals; pipeline planner; starter dashboards per domain.
- Insight engine: anomalies, trends, PoP deltas; forecasting beta.

## v0.4 – Sharing, Governance, Performance

- Sharing/permissions, schedules, pre‑aggregations, cache.
- Audit logs, approvals, promotion workflows; query performance tuning.

## v0.5 – Private Beta

- Finance and Sales starter packs; spend anomaly insights.
- Usage analytics, feedback loop, docs.

## v1.0 – GA

- SSO/SCIM, exports/subscriptions, admin UX polish, migrations from Power BI.
- Hardening, scale tests, support readiness.

## Success Criteria

- Connectivity parity (Snowflake, Salesforce, Xero, Spendesk) and reliable refresh.
- Modeling parity (governed metrics, relationships, RLS) and easier UX than PBI.
- Performance SLAs met; cost transparency; local‑first AI option.


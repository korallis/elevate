# SME Analytics & Insights Platform — Product Requirements Document (Full)

_Last updated: 2025-08-29_

## 0) Snapshot

- **Audience:** SMEs (founders, ops, finance, marketing), data-adjacent engineers
- **Positioning:** AI-assisted analytics with enterprise polish, SMB simplicity
- **Stack (TypeScript everywhere):** Next.js 15 • React 19 • Node 22 (LTS) • Hono API • Temporal TS • Drizzle ORM (PG16) • Snowflake (primary data source) • Redis • shadcn/ui + Tailwind v4 (+ @tailwindcss/postcss) + Radix • Playwright exporter • OpenTelemetry • pnpm 10 • Turbo 2 • ESLint 9 (flat) + Prettier 3 • TypeScript 5.9
- **Key Pillars:** Connect → Model (semantic metrics) → Explore → Visualize → Share/Automate → Govern

---

## 1) Vision & Goals

- **Vision:** Make reliable, beautiful analytics effortless for SMEs.
- **Primary goals:**
  1. _Connect quickly_ to common SME systems (payments, accounting, commerce, marketing).
  2. _Trust the numbers_ via a governed semantic layer (single source of truth).
  3. _Self-serve insights_ through natural language + safe SQL + gorgeous dashboards.
  4. _Operationalize_ insights via alerts, schedules, and exports.
- **Non-goals (MVP):** No on-prem agents, no real-time stream processing, no self-hosting UI.

---

## 2) Personas & Top Jobs-To-Be-Done

- **Founder/GM:** “What’s MRR, churn, and runway this month?”
- **Ops Manager:** “Did orders ship on time? Where are bottlenecks?”
- **Finance Lead:** “Revenue recognition, cash vs. accrual, cohort LTV/CAC.”
- **Marketing Lead:** “Channel performance, CAC payback, attribution.”
- **Data-Adjacent Eng:** “Reusable metrics, controlled SQL, versioned models.”

---

## 3) Success Metrics (Product KPIs)

- TTFI (time to first insight) < **15 min** from sign-up.
- First connector added rate > **60%**.
- First dashboard created within **24h** > **40%** of new orgs.
- MAU/WAU retention at **D30 > 35%**.
- Support-triggered data accuracy issues < **1%** of orgs per month.
- Report delivery success (email/Slack) **> 99%**.

---

## 4) Scope Overview (Feature Map)

### A) Authentication, Orgs & Workspaces

- Public landing page (marketing) with clear Login / Sign up CTAs — no dashboards visible on landing.
- Email/password + OAuth (Google/Microsoft). SSO/SAML **(Pro+)**.
- Multi-tenant Orgs → Departments → Workspaces → Roles (Owner, Admin, Editor, Viewer).
- RBAC on datasets, queries, dashboards. Org invite flows. Domain capture.
- **Sharing model:** Dashboards/reports are private by default, and can be shared to the entire org, one/more departments, and/or specific users.
- **Audit log** (auth, data-connect, sharing, exports).

### B) Data Connectivity, Catalog & Ingestion (ETL/ELT)

- Snowflake is the primary MVP source (others like Stripe, Xero/QB, Shopify, GA4, Sheets/CSV, Postgres are planned/optional).
- Secure auth (key pair / OAuth), secrets in KMS; encrypted at rest.
- Automated schema discovery on Snowflake: enumerate databases, schemas, tables, views, columns, data types, constraints; infer relationships.
- **Data catalog:** searchable, browsable catalog with entities, relationships, freshness, and ownership.
- **Ingestion engine (Temporal):** automated schedules, webhooks, and manual “Run now”.
- Incremental sync where possible, schema evolution detection.
- **Data quality checks:** row-count drift, null spikes, schema changes → surface warnings.
- **Lineage stub:** Source → Staging → Modeled tables.

### C) Storage & Modeling

- **Warehouse:** Snowflake (primary) and Postgres 16 (operational/cache).
- **Modeling:** Drizzle ORM + SQL views. Staging → modeled **star schemas** per domain.
- **Semantic Layer:** Versioned Metrics & Dimensions defined in TypeScript/Zod.
  - _Example core SaaS metrics:_ MRR, ARR, ARPA, Churn (logo & revenue), Expansion, LTV, CAC, Payback, Cohorts.
  - _E‑commerce metrics:_ GMV, AOV, Conversion Rate, Refund Rate, RPV, CAC, ROAS.
  - _Marketing metrics:_ CPC, CPM, CTR, CPA, CAC per channel, Attribution.
  - _Compliance templates (healthcare staffing):_ Caregivers/Candidates compliance status vs mandatory requirements, expiries due, gaps.
- **Transformations & Aliases (MVP):** simple UI to rename fields (x → Y), define friendly labels, and lightweight derived fields/mappings without code.
- **Versioning:** semantic model versions (vX.Y), change notes, impact analysis.

### D) Query & Exploration

- **AI Assist:** NL → SQL with schema awareness + guardrails; editable SQL; show cost/row-limit.
- Auto‑report & dashboard generation from prompt (e.g., “Show all caregivers/candidates compliant against mandatory requirements”).
- Parameterized queries, saved queries, owners & permissions, result caching.
- **Query templates:** “MRR by plan”, “Cohort retention”, “ROAS by channel”, “Caregiver Compliance Overview”, etc.
- **Budget guardrails:** per-user/per-workspace daily credits; cost estimation.

### E) Visualization & Dashboards

- **Charts:** line/area/bar/pie/stacked, KPI cards, tables, heatmaps, distributions.
- **Dashboard builder (manual):** drag‑n‑drop grid, sections, tabs, filters, time pickers, theme tokens.
- **Auto dashboards:** generate full dashboards from prompts and selected templates (incl. Compliance dashboard for caregivers/candidates).
- **Cross-filtering** & drill-through (Phase 2).
- **Templates:** SaaS Finance, E‑com Overview, Marketing Performance, Ops Fulfillment, Healthcare Compliance.
- **Design system:** shadcn/ui + Tailwind + Radix + tokens (dark/light), motion polish.

### F) Collaboration, Sharing & Embeds

- Comments on widgets (with @mentions). Versioned dashboard snapshots.
- Sharing scope: org-wide, department-level, or specific users; default private.
- Link sharing: org-internal, org-external with expiry, password **(Pro+)**.
- **Embed SDK:** iframe + signed token; host restrictions; white‑label **(Pro+)**.

### G) Alerts, Schedules & Exports

- Threshold & anomaly alerts on any metric (Z-score, pct change).
- **Schedules:** email & Slack/Teams digests (daily/weekly/monthly).
- **Exports:** PDF/PNG dashboards; CSV/XLSX query results; programmatic export API.
- Brandable report covers (logo, brand colors).

### H) Governance, Security & Compliance

- PII classification tags; field masking; role-based row-level filters **(RLS)**.
- GDPR: data export/delete, DPA, data residency note (Snowflake region).
- Backups & retention policies.
- **Audit trails** for queries, exports, sharing, admin changes.

### I) Billing & Plans

- Stripe Billing: Trials, Free/Pro/Team plans, metered add-ons (credits/exports).
- Usage meters: queries run, rows scanned, exports, storage.
- In-app upgrade flows, invoices, VAT handling.

### J) Observability & Reliability

- OpenTelemetry traces (API, worker, warehouse queries), structured logs (Pino), metrics.
- **SLOs:** API p95 < 400ms (cache), < 2s (direct query); Export success > 99%.
- Error budgets & alerting to on-call.

### K) Accessibility & Internationalization

- WCAG 2.1 AA baseline (focus states, contrast, keyboard nav, screen reader labels).
- i18n-ready strings, locale-aware numbers/dates/currency.

---

## 5) Detailed Requirements & Acceptance Criteria

### 5.1 Entry & Access (MVP)

- As a visitor, I see a public landing page with product value and clear Login/Sign up; no dashboards are visible.
  _AC:_ Anonymous users never see org data; login redirects to the user’s workspace home.

### 5.2 Connectors (MVP)

- **Stripe**: OAuth, objects: charges, invoices, subscriptions, customers, prices.  
  _AC:_ User connects Stripe in < 3 steps; first sync completes; “Subscriptions by plan” template loads without manual SQL.
- **Xero / QuickBooks**: OAuth, accounts, invoices, payments.  
  _AC:_ Cash vs accrual revenue dashboard renders for last 12 months.
- **Shopify / WooCommerce**: OAuth/API key; orders, products, customers, refunds.  
  _AC:_ “E‑com Overview” template: GMV, AOV, conversion, refunds by week.
- **GA4 / Ads (Google/Facebook)**: OAuth; campaigns, spend, clicks, conv.  
  _AC:_ “Marketing Performance” template: ROAS by channel with date filter.
- **Sheets / CSV / S3**: schema mapping UI, column typing, incremental file loads.  
  _AC:_ Upload CSV → typed table → queryable in 60 seconds.

### 5.3 Data Catalog & ETL (Snowflake-first)

- **Schema Discovery & Catalog (Snowflake):**
  - On connect, scan INFORMATION*SCHEMA/ACCOUNT_USAGE to enumerate databases, schemas, tables, views, columns, data types, constraints/keys, and row counts.
    \_AC:* A browsable catalog is built with entities and relationships; refreshed on schedule and on-demand.
- **Transformations & Aliases (No‑code):**
  - As an Editor, I can rename fields (x → Y), define friendly labels, and create simple mappings/derived fields without writing code.
    _AC:_ Transformations are applied in the semantic layer; reversible; audited with who/when.
- **ETL / Sync:**
  - Configure automated schedules and run manual “Sync now”.
    _AC:_ Runs appear with status, duration, row counts, and logs; failures alert.

### 5.4 Semantic Layer

- **Define metric** (name, description, formula, time grain, filters) and dimension (type, allowed values).  
  _AC:_ Metric DSL emits validated SQL; each metric is testable and previewable.
- **Versioning:** track changes, backward compatibility notes; breaking-change warnings.  
  _AC:_ Editing a metric shows impacted queries/dashboards.

### 5.5 Explore & Build

- **NL → SQL** with schema prefixing, safe table/column allow-list.  
  _AC:_ Generated SQL runs within org workspace, under budget, and is editable.
- **Saved Queries** with owners, tags, run history, inputs (date range, segment).  
  _AC:_ Anyone with Viewer can run but not edit; Editor can update; audit captures diff.
- **Visual Builder** with real-time previews and presets.  
  _AC:_ Create a multi-widget dashboard in < 5 minutes from any template.

#### 5.5.1 Auto‑Generated Dashboards (Compliance Use Case)

- As a user, I can request: “Build me a dashboard that shows all caregivers or candidates compliant against mandatory requirements (and highlight non‑compliant).”
  _AC:_ System inspects the catalog, proposes metric/dimension mappings, generates charts (compliance %, non‑compliant list, expiries due), and saves an editable dashboard.

### 5.6 Alerts, Schedules & Exports

- **Alert rule** on any metric: above/below, pct change, anomaly.  
  _AC:_ Slack/email notifications with sparkline + “view in app” link.
- **Scheduled reports** (PDF/PNG/HTML email) with time window and filters.  
  _AC:_ Reports deliver on schedule with correct data snapshot and theming.

### 5.7 Governance & Security

- **Role matrix:** Owner, Admin, Editor, Viewer; custom roles **(Team)**.  
  _AC:_ Viewers cannot see masked PII; audit shows access denials.
- **PII masking:** field tags → automatic redaction in UI & CSV unless role allows.  
  _AC:_ Masking enforced in exports and embeds.
- **Sharing scopes:** org, department(s), and specific users; defaults to private.  
  _AC:_ Share dialog supports selecting org, one/more departments, and individuals; audit records shares.

### 5.8 Billing

- **Plans:** Free (1 workspace, 2 connectors, 5 dashboards), Pro, Team.  
  _AC:_ Stripe webhooks sync entitlements; upgrade/downgrade proration handled.

---

## 6) UX Principles & Design System

- **Clarity > Cleverness:** neutral palette, strong hierarchy, clean tokens.
- **Motion for meaning:** subtle Framer Motion micro-interactions (hover, expand).
- **Consistency:** same spacing scale, radii, shadow depths across pages.
- **Themable:** brand color applied to charts, links, buttons; instant dark mode.

---

## 7) Architecture (Implementation Notes)

- **Web (Next.js 15, React 19, RSC)**
  - App Router, Server Actions for sensitive ops (token exchange), React Query on client.
  - Turbopack for dev and production builds.
  - shadcn/ui + Tailwind v4 (+ @tailwindcss/postcss) + Radix for accessible components.
- **API (Hono on Node 22 LTS)**
  - tRPC or REST (OpenAPI via zod-to-openapi). Zod validation, Pino logging, CORS.
  - Budget middleware (Redis token bucket).
- **Worker (Temporal TS)**
  - Workflows for ingestion, transform, refresh, exports. Backoff & retries baked-in.
- **DB & Warehouse**
  - Postgres (Neon/Aurora) for app data + cache; Snowflake for analytics.
  - Drizzle migrations, drizzle-kit; KMS-managed secrets.
- **Snowflake Discovery**
  - Use INFORMATION_SCHEMA and ACCOUNT_USAGE to enumerate databases/schemas/tables/views/columns and constraints.
  - Infer FK relationships where not explicit; maintain a catalog index and relationship graph; schedule refresh + manual trigger.
- **Exporter (Playwright)**
  - Headless chromium, brandable layouts, PNG/PDF.
- **Observability**
  - OpenTelemetry traces + collector → Grafana/Tempo/Loki (or Cloud vendor).
- **Tooling**
  - pnpm 10 (Corepack), Turbo 2 tasks, TypeScript 5.9, ESLint 9 (flat) + Prettier 3.
- **CI/CD**
  - GitHub Actions: lint, test, typecheck, build, containerize, deploy to Cloud Run/Fargate. Matrix on Node 22/24.

---

## 8) Roadmap & Releases

- **Phase 1 (MVP, 8–10 wks):**
  - Public landing page with Login/Sign up (no dashboards on landing).
  - Auth/Orgs/Departments/Workspaces + RBAC + Audit.
  - Snowflake connector with schema discovery & data catalog; ETL schedules + manual “Run now”.
  - Semantic v0 + Transformations/Aliases (rename fields, friendly labels, simple mappings).
  - NL→SQL v0 + Auto‑generated dashboards from prompt (incl. Caregiver/Candidate Compliance).
  - Manual Dashboard Builder v1; Exports v1; Schedules v1; Sharing (org/department/user); Billing v1.
- **Phase 2 (+6 wks):** Cross-filtering, Cohorts, Anomaly alerts, Embeds v1, Comments, Templates v2, Metric versioning, Admin audit UI.
- **Phase 3 (+8 wks):** White-label, SAML, Custom roles, Marketplace (templates/connectors), Forecasting (basic), Mobile-friendly report digest.

---

## 9) “Feature Install” Checklist (for build tracking)

- [ ] Public landing page (Login/Sign up; no dashboards)
- [ ] Auth (Email/OAuth) + Orgs/Departments/Workspaces + RBAC
- [ ] Audit log (auth, connects, shares, exports)
- [ ] Snowflake connector + schema discovery/catalog
- [ ] Ingestion engine (Temporal): schedules + manual “Run now” + quality checks
- [ ] Semantic v0 + Transformations/Aliases UI (rename fields, mappings)
- [ ] NL→SQL v0 + Auto dashboard (Caregiver/Candidate Compliance)
- [ ] Manual Dashboard Builder v1 + Sharing (org/department/user)
- [ ] Exports v1 + Schedules v1 + Billing v1
- [ ] Observability (OTel) + SLOs
- [ ] Security (PII masking, RLS filters) + GDPR flows
- [ ] CI/CD + IaC baseline

---

## 10) Risks & Mitigations

- **NL→SQL accuracy:** guardrails (schema allowlist, query sim, row limits); show SQL; easy rollback.
- **Connector API limits:** incremental syncs; adaptive backoff; user-configurable windows.
- **Data correctness:** unit tests for metrics; sample baselines; canary dashboards.
- **Costs:** query budgets + caching; warehouse usage caps; storage TTLs.

---

## 11) Open Questions

- Which commerce/marketing connectors are top-3 for launch?
- Preferred residency & compliance requirements?
- Embeds licensing and pricing tiers?

---

## 12) Definition of Done (MVP)

- A new org can: sign up → add Stripe → open SaaS Finance template → export PDF → schedule weekly email → invite a teammate (Viewer) → they can view without errors.
- p95 API < 2s on uncached queries; unit/integration tests pass; accessibility checks pass; security review complete.

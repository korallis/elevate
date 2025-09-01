# Architecture Overview

Goal: Replace Power BI with a web‑only, multi‑tenant analytics app that automates data mapping, ETL, and dashboard creation (with manual expert controls), supporting Snowflake, Salesforce, Xero, and Spendesk.

## High‑Level Components

- Web App (Next.js + React)
  - Responsive, elegant UI with Tailwind; shadcn/ui components.
  - App Router (server components) for performance and streaming.
  - Manual mode: visual modeling, SQL Lab, custom dashboards.

- API & Server Actions
  - Data access layer for metadata, semantic layer, dashboards.
  - Connectors proxy with scoped credentials.
  - AI services orchestration and prompt grounding.

- Background Workers
  - ETL orchestration (ingest, transform, load, DQ checks).
  - Scheduler (incremental refresh windows, retries, dead letter).
  - Pre‑aggregation & cache warmers.

- Data Layer
  - Metadata DB: PostgreSQL (orgs, users, RBAC, semantic models, mappings, pipelines, dashboards, logs).
  - Analytics Warehouse: Snowflake (preferred) and/or Postgres for light deployments.
  - Caching/Pre‑aggregations: materialized views, summary tables.

- AI Layer
  - Local LLM via Ollama (Llama 3.1 8B/70B) with model adapter.
  - Optional OpenAI fallback (configurable per org/tenant policy).
  - Agents: Schema Mapper, Pipeline Planner, Visualization Designer.

- Connectors
  - Snowflake (snowflake-sdk 2.x), Salesforce (jsforce), Xero (xero-node), Spendesk (REST + webhooks).
  - Incremental ingestion (watermarks, bookmarks, CDC where supported).

- Security & Tenancy
  - Multi‑tenant RBAC, division scoping, RLS at semantic layer.
  - Secrets vaulted; least privilege to external systems.
  - Audit logs and lineage for governance.

## Data Flow (Auto Mode)

1) Admin connects a source (OAuth/keys).
2) System profiles schemas, proposes canonical mappings (AI‑assisted).
3) Human review/approve mappings (versioned, rollbackable).
4) ETL jobs normalize to canonical staging and load conforming dims/facts.
5) Pre‑aggregations computed; dashboards auto‑generated from goals/ints.
6) Users explore, filter, drill; insights engine surfaces anomalies/forecasts.

## Data Flow (Manual Mode)

- Visual or SQL‑first modeling; custom measures/dimensions; SCD options.
- ETL builder with reusable transforms and environment promotion.
- SQL Lab (guarded) with history, exports, and governance.

## Observability

- Structured logs; traces for ETL and queries; metrics for refresh latency, error rates, and query performance.

## Notes

- Exact package versions will be confirmed at scaffold time with MCP servers.
- Temporal vs. queue-based orchestration will be decided via ADR; initial MVP may use a queue for simplicity.


# ADR 0004: Connectors & ETL

Status: Accepted

## Context

We must integrate Snowflake, Salesforce, Xero, and Spendesk with incremental sync, transform to a canonical model, and ensure reliability and governance.

## Decision

- Libraries:
  - Snowflake: `snowflake-sdk` 2.x (key‑pair/OAuth; query tagging).
  - Salesforce: `jsforce` (OAuth2; REST/Bulk/Streaming where applicable).
  - Xero: `xero-node` (OAuth2; Accounting API; automatic token refresh).
  - Spendesk: REST API with OAuth and webhooks for events.
- ETL Strategy:
  - Incremental bookmarks (last modified/created); CDC where possible.
  - Staging → canonical dims/facts with idempotent upserts.
  - Data quality checks and lineage captured per job.
  - Schedules with retries and dead‑letter handling.

## Consequences

- Reliable refresh without full reloads; clear mapping governance.
- Requires careful secrets management and OAuth flows per connector.

## Alternatives Considered

- Off‑the‑shelf ELT tools (reduce build time but increase cost and reduce control).

## Follow‑ups

- Validate rate limits and pagination strategies per API.
- Define backfill strategy and partial failure recovery.


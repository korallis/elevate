# Non‑Functional Requirements (Initial)

## Performance & Scalability

- p95 dashboard load < 1.5s on cached/aggregated data; < 4s on live queries.
- Support orgs with 10–1000 active users; concurrency target 200 active sessions per region.
- ETL windows: daily large loads < 60 min; incremental refresh < 10 min.
- Large datasets: 100M–1B row facts via Snowflake; pre‑aggregations for interactive UX.

## Availability & Reliability

- Target 99.9% uptime for core UI/API; scheduled ETL outside business hours where possible.
- Idempotent jobs with retries and dead‑letter queues; recoverable from partial failures.
- RPO ≤ 4 hours, RTO ≤ 2 hours for metadata services.

## Security & Compliance

- Multi‑tenant isolation with RBAC and RLS; audit trail for admin/config changes.
- Secrets in a vault; least privilege to external systems; encryption in transit and at rest.
- PII classification, masking policies, export controls; data retention policies per org.

## Observability

- Structured logs with trace IDs for ETL and queries; metrics dashboards for latency, error rates, cache hit rates.
- Alerts on failed jobs, slow queries, data quality violations.

## UX & Accessibility

- Responsive UI, keyboard navigation, WCAG AA; dark/light themes.
- Shareable artifacts (links, exports) respect permissions and RLS.

## Cost & Operability

- Warehouse usage monitored; pre‑aggregation strategy tuned per org size.
- Configurable AI mode (local vs. cloud) to control cost and privacy.


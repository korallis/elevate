# Security, Tenancy, and Governance

## Tenancy & Roles

- Tenancy: Organization → Divisions → Teams/Departments → Users.
- Roles (baseline): Org Admin, Division Admin, Analyst, Viewer.
- Resource scoping: dashboards, datasets, pipelines, connectors bound to org/division.

## Access Control

- RBAC enforced at API and UI; route‑level guards with server enforcement.
- Row‑Level Security (RLS) at semantic layer for per‑user/role filters.
- Object‑level privileges for datasets, dashboards, and pipelines.

## Secrets & Credentials

- OAuth flows for Salesforce/Xero/Spendesk; Snowflake with key‑pair or OAuth.
- Secrets stored in a vault with rotation; audit access and usage.
- Short‑lived tokens preferred; refresh flows tracked and monitored.

## Data Protection

- TLS everywhere; encryption at rest for metadata DB and caches.
- PII tagging in semantic layer; masking and minimized export of sensitive fields.
- Data retention policies configurable per org; right‑to‑erasure procedures.

## Governance & Auditability

- Versioning: semantic models, mappings, dashboards, pipelines with changelogs.
- Lineage: source → transforms → datasets → dashboards; visible in UI.
- Audit logs: admin actions, permission changes, data exports, and failed/successful jobs.

## Compliance Path (Future)

- SOC2: change management, incident response, access reviews.
- SSO/SAML, SCIM user provisioning for enterprise tenants.


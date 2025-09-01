# Power BI and Competitors – Research Summary

This section summarizes Power BI’s key capabilities and limitations, and compares major competitors to ensure our solution covers must‑have features while simplifying UX and operations.

## Power BI – Capabilities
- Data connectivity: very broad connectors; Import, DirectQuery, and Live connection (Analysis Services). Dataflows (Power Query/M) for prep and scheduled refresh.
- Modeling: star schema, relationships, hierarchies, calculated columns/tables, measures via DAX, Row‑Level Security (RLS), role definitions, composite models, field parameters.
- Visualization: rich out‑of‑box visuals, custom visuals (AppSource), theming, cross‑filtering, bookmarks, drill‑down/through, Q&A (natural language), decomposition tree, smart narratives.
- Dashboards & collaboration: dashboards (pinned tiles), apps/workspaces, comments, alerts, subscriptions, export to PDF/PPT, paginated reports (SSRS), lineage view, endorsement.
- Governance & security: audit logs, sensitivity labels, RLS, tenant controls, incremental refresh, large models (Premium), XMLA endpoint (Premium/PPU) for external tools.
- Distribution & embed: Teams/SharePoint integration, embed via Power BI Embedded, limited "publish to web".

## Power BI – Limitations (Common Pain Points)
- Desktop dependency/PBIX files increase friction; change control is complex.
- DAX learning curve is steep; measure reuse and testing are hard for many teams.
- Dataset size/refresh/licensing complexity; Premium needed for large features and XMLA.
- On‑prem gateway management; mixed reliability for some third‑party connectors.
- Governance can feel heavy; developer experience split across Desktop, Service, and external tools.

## Competitors Overview
- Tableau: best‑in‑class visuals and interactions; Level of Detail (LOD) expressions; Hyper engine; Tableau Prep for ETL. Strong for analysts; weaker central semantic layer and data modeling governance than Looker; cost moderate/high.
- Looker (Google): robust semantic layer (LookML), governed metrics, live queries to warehouses; excellent embedding. Learning curve for LookML; best for metric governance; cost moderate/high.
- Qlik Sense: associative engine enabling powerful ad‑hoc exploration; Qlik script ETL; good self‑service; cognitive engine for suggestions. Distinct paradigm; governance varies; cost moderate/high.
- ThoughtSpot: search‑driven analytics with NLQ; SpotIQ insights; strong for live warehouse. Excellent for business users; expensive; less flexible manual modeling.
- Sigma Computing: spreadsheet‑like UX over warehouses; live compute; low barrier for business users; good governance; cost moderate.
- Mode Analytics: SQL‑first + notebooks; great for analysts and data science workflows; collaborative; lightweight dashboards; less business‑user friendly.
- Metabase (OSS/Pro): approachable GUI + SQL; embedding; simple data modeling; affordable; fewer enterprise features and advanced modeling.
- Apache Superset (OSS): SQL‑centric; broad visualizations; mature; lacks rich semantic layer and advanced governance out‑of‑box; engineering heavy.
- Domo: all‑in‑one cloud BI; many connectors; closed platform; expensive; strong exec dashboards.
- Sisense: strong for embedded analytics and developer extensibility; proprietary engine; cost moderate/high.
- Hex: notebook‑centric; analytics apps; less suited as primary enterprise dashboard platform.

## Implications for Elevate BI
- We need a governed metrics/semantic layer à la Looker, but with easier UX and AI assistance.
- We must preserve Power BI‑like RLS, relationships, measures, and dashboard expressiveness.
- We will avoid Desktop/PBIX friction by being fully web‑based and API‑first.
- Strong NLQ and auto‑charting are differentiators (ThoughtSpot‑like) combined with manual power tools.
- For cost control, we favor warehouse‑live queries (Snowflake) with smart caching, and OSS components where practical (Airbyte, dbt, Superset‑grade charts/Vega‑Lite/ECharts).

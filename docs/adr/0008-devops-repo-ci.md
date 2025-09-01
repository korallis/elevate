# ADR 0008: DevOps, Repo, CI

Status: Accepted

## Context

We aim for a simple, reliable GitHub‑based workflow aligned with Agile practices, with automated checks and clear conventions.

## Decision

- Repo workflow: Trunk‑based with short‑lived feature branches; protected `main`.
- Conventions: Conventional Commits; CODEOWNERS; PR templates and checklists.
- CI: GitHub Actions with type checks, lint, unit/integration tests, build; preview environments later.
- Project tracking: GitHub Projects board with epics and sprints.

## Consequences

- Faster iteration and clearer history; easy onboarding.
- Requires discipline in PR/issue hygiene and CI maintenance.

## Alternatives Considered

- GitFlow (more ceremony; slower for a small team).

## Follow‑ups

- Define required status checks and code owners prior to first scaffold.
- Add security/code scanning workflows after initial scaffold lands.


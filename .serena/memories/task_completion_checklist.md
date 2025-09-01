# Task Completion Checklist

- Lint: run `pnpm lint` and ensure no errors.
- Types: run `pnpm typecheck` and fix type issues.
- Build: run `pnpm -w build` to ensure all packages/apps build.
- Format: run `pnpm format:check` (or `pnpm format` to apply).
- Tests: if tests exist or were added, run `pnpm test` or per-package tests.
- Docs: update relevant README/ADR/docs if behavior, APIs, or commands changed.
- Env: confirm secrets are not committed; `.env.example` updated if new vars introduced.
- CI: ensure steps pass locally (Node 22+); push and open PR with description and steps to test.

# Style and Conventions

- Language: TypeScript-first; Node >= 22.
- Formatting: Prettier (2 spaces, single quotes, semicolons, trailing commas, width ~100). Commands: `pnpm format`, `pnpm format:check`.
- Linting: ESLint v9 flat config (`eslint.config.mjs`) with Next plugin where applicable. Command: `pnpm lint`.
- Types: Enable strict TS; run `pnpm typecheck` (turborepo pipes to per-package `tsc --noEmit`).
- Naming:
  - Packages: use `@sme/*` for shared libs (`@sme/db`, `@sme/schemas`) and `ui` for UI lib.
  - App scopes: `@sme/web`, `@sme/api`, `@sme/worker`, `@sme/exporter`.
  - Keep shared code in `packages/*`; avoid cross-app relative imports across `apps/*`.
- Git/PRs:
  - Commits: imperative mood with scope, e.g. `api: add /snowflake/catalog endpoint`.
  - Group small changes logically; keep diffs minimal; update docs when needed.
- Security:
  - Never commit secrets. Base `.env` on `.env.example`.
  - Web env exposed via `NEXT_PUBLIC_*`; server-only secrets remain unprefixed.
- Tailwind CSS v4: uses `@tailwindcss/postcss` in web app; PostCSS and Autoprefixer set in `apps/web`.
- Turbo tasks: `build` depends on `^build`; `dev` un-cached; standard tasks: `lint`, `test`, `typecheck`.

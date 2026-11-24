# Testing

| Command | What it covers |
| --- | --- |
| `pnpm typecheck` | TypeScript across all packages |
| `pnpm test` | unit tests: marking, contracts, abilities, db/RLS, web exam machine, worker, and API (PGlite, no services needed) |
| `pnpm --filter api test:isolation` | cross-tenant isolation over every route |
| `cd services/docparse && pytest` | segmenter and parser |
| `pnpm e2e` | Playwright journeys in a real browser against the running stack |

E2E specs are numbered by journey step (login, ingestion, exam, flagged paper, test assignment, admin pages, mobile layout).
They write screenshots to `demo/screenshots/`. First run: `cd e2e && pnpm exec playwright install chromium`.
Run one Playwright output directory at a time (`--output=<dir>`). E2E runs leave test records in the demo database.

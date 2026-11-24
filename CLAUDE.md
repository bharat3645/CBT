# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

The monorepo exists and the MVP flow runs end to end as a local POC (see `docs/demo.md` for the demo script and known limits).
The PRD (`docs/PRD.md`) is the source of intent; the SRS is `docs/SRS.pdf`.

## Commands

- Whole stack: `demo/start-stack.sh` (docker services, migrate, seed, docparse, api, worker, web). Demo logins `admin|teacher|student|parent@demo.test` / `Passw0rd!Passw0rd`.
- Install: `pnpm install`. Typecheck all: `pnpm -r run typecheck`. Tests: `pnpm -r run test`; one package `pnpm --filter api test`; one file `pnpm --filter api exec vitest run path/to/file.test.ts`.
- DB: `pnpm --filter @cbt/db db:generate` (after editing `packages/db/src/schema/*`, append one export to `schema/index.ts`), `db:migrate` (also applies RLS/audit via `applySecurity()`), `pnpm --filter api seed`.
- API runs through `vite-node` (SWC for Nest decorators), not a compiled build. docparse: `DOCPARSE_USE_DOCLING=false python -m uvicorn docparse.main:app --port 8000`; its tests: `pytest` in `services/docparse`.
- E2E (real browser, needs the stack up): `cd e2e && PLAYWRIGHT_BROWSERS_PATH=C:/pw-browsers pnpm exec playwright test [file] --output=<own dir>`. Specs are numbered by journey step and write screenshots to `demo/screenshots/`.

## Where things live

- `apps/api/src/modules/<m>`: one Nest module per area. Register new modules in `modules/index.ts` (`FEATURE_MODULES`). Every new route needs a case in `apps/api/test/isolation/cases.ts` or the route-coverage test fails (that file is not UTF-8; edit it byte-safely).
- Shared tokens provided by core: `DB` (request-scoped RLS transaction), `DB_SYSTEM`, adapters `StorageService/PdfService/Notifier/QueueService`. `@Can`, `@Public`, `@Ctx` decorators.
- `apps/worker`: processors (`evaluate`, `rank`, `notify`, `parse-paper`) and the exam auto-submit sweep. It connects as the DB owner (bypasses RLS), so every query must filter by `institute_id`.
- `packages/marking`: pure marking engine. The test's preset marking (`test.config.marking`) overrides per-question marks (`schemeFor` in the evaluate processor).
- `packages/contracts`: Zod schemas, with subpath exports (`@cbt/contracts/exams`, etc.).
- Web: feature code in `apps/web/src/features/<name>`, route files in `src/app/(app)/<role>/...` mount them. Auth client base path is `/api/v1/auth`; the role comes from `GET /api/v1/me`.
- Dev gotchas: SeaweedFS needs the dev identity in `docker/seaweedfs-s3.json`; the API `main.ts` closes the app on hot reload (otherwise EADDRINUSE); run only one Playwright output dir per concurrent run.

## Architecture rules that matter

- **Build vs assemble:** hand-build only the four differentiators: the paper-to-question segmenter, the conversion review editor, the CBT engine, and evaluation/ranking. Everything else uses off-the-shelf blocks.
- **Adapter rule:** every third-party block sits behind our own interface (`StorageService`, `PdfService`, `Notifier`, `DocParser`, …). Business code never imports a vendor SDK directly.
- **Licensing is a hard constraint (closed-source SaaS):** no AGPL/GPL code linked into our code. Copyleft tools (ClamAV, k6, Safe Exam Browser) are allowed only as separate unmodified services or dev tools. Rejected on purpose: PyMuPDF (AGPL), MinIO CE, Redis 8, Garage. CI should fail on any new AGPL/GPL dependency in `apps/` or `packages/`.
- **The API never does slow work inline.** It writes to Postgres and enqueues BullMQ jobs. The worker handles auto-submit sweeps (every 10–30 s), evaluation, ranking, imports and notifications.
- **Tenant isolation:** Postgres row-level security via Drizzle, plus CI tests that call every endpoint as Institute B against Institute A's data. Audit table is insert-only, fed by DB triggers.
- **Exam answer path:** the browser saves each answer with an attempt ID and a sequence number (Dexie offline queue). The API does an idempotent upsert. The timer is server-driven.
- **CBT engine is configured by data, not code (presets):** NTA-style (default), private-university MCQ, practice. Each preset sets sections, palette, marking, navigation, numeric rules and strict-mode level. The pilot exam pattern is still an open question.
- **Paper ingestion (M5):** store the untouched original → ClamAV → docparse → deterministic rule-based segmenter (numbering, option markers, section headings). The optional AI pass only handles ambiguous cases and must be labelled AI-INFERRED (others: EXTRACTED, MANUAL). Each draft carries a confidence score and a source page region. A paper with an open flag or a missing answer key cannot be approved (HTTP 422). Approval freezes the version.
- **UI:** the live exam screen is a full-screen layout with no sidebar (top bar with server countdown, centre question, right 5-state palette, bottom action bar, always-visible saved indicator). All other screens use the shadcn `Sidebar` shell with per-role groups.
- **Process:** trunk-based development with small PRs. Production deploys (Coolify) need manual approval and are blocked during scheduled exam windows.

## Build order (PRD)

1. Monorepo, compose stack, CI, staging.
2. M1 tenancy/auth/RBAC/audit, plus the isolation test harness.
3. M4 question model and editor.
4. M6 CBT engine.
5. M7 evaluation.
6. M5 docparse and conversion editor.
7. Ranks, dashboards, syllabus, notifications.
8. Hardening: k6 at 750 users, security test, restore drill.

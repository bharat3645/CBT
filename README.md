# PrepDesk CBT

A multi-tenant computer-based-test (CBT) platform for entrance-exam coaching institutes.
Teachers upload a Word/PDF question paper, review the auto-segmented questions, publish a timed test to batches,
students sit it in an NTA-style exam screen, and results, ranks, attendance, feedback and PDF reports follow automatically.

- **Hosted demo (no install): <https://prepdesk-demo.vercel.app>**. Click a role on the login page. It runs entirely in the browser on recorded sample data; see [Hosted demo](#hosted-demo).
- **Run it locally:** see [Quick start](#quick-start), about 10 minutes, full real stack.

## Demo accounts

Every account below exists after `pnpm --filter api seed` / `pnpm demo:reset`, and is one click on the hosted demo's login page.

| Role | Email | Password | Lands on | What to try |
| --- | --- | --- | --- | --- |
| Institute admin | `admin@demo.test` | `Passw0rd!Passw0rd` | `/admin` | Batches, people, papers awaiting approval, flags, results, reports, settings |
| Teacher | `teacher@demo.test` | `Passw0rd!Passw0rd` | `/teacher` | Upload a paper, review it, build a test, **mark attendance**, **write feedback** |
| Student | `student@demo.test` | `Passw0rd!Passw0rd` | `/student` | Take the live exam, see rank and weak topics, **practise by topic** |
| Parent | `parent@demo.test` | `Passw0rd!Passw0rd` | `/parent` | Child's results, **attendance**, **teacher feedback**, syllabus progress |
| Platform owner | `owner@cbt.local` | `ChangeMe!12345` | `/superadmin` | Approve or suspend institutes that signed up |

Other seeded people (all `Passw0rd!Passw0rd`): teachers `meera.iyer@` and `rohan.kulkarni@demo.test`, and 24 more students such as `aarav.sharma@demo.test`.
Demo Academy has 3 batches, 25 students, a 60-question tagged bank, 6 tests (4 graded, 1 live now, 1 upcoming), 47 graded attempts with ranks, three weeks of attendance and teacher feedback.

## Hosted demo

The hosted build is a **static, backend-less demo**. A browser-side mock (`apps/web/src/lib/demo`) answers every `/api/v1` call from
`apps/web/public/demo/snapshot.json`, a recording of the real API's responses for each role. So lists, dashboards, results, ranks and analytics are real data from the real
backend; sign-in and writes are simulated. Interactive flows (take the exam, mark attendance, send feedback, practise) keep their state in the browser tab for the session.
State survives a reload but is cleared when the tab is closed, and nothing is ever sent to a server.

Deploy your own copy to Vercel (needs only the Vercel CLI and an account):

```bash
npx vercel login
npx vercel --prod          # run from the repo root. One-time project settings: Root Directory apps/web,
                           # env NEXT_PUBLIC_DEMO=1 and AUTH_REQUIRED=1 (vercel.json build.env is NOT honoured)
```

or import the repo in the Vercel dashboard with Root Directory `apps/web` and those two environment variables; `apps/web/vercel.json` supplies the install command.

Refresh the recording after changing seed data or API responses:

```bash
pnpm demo:reset                                         # clean sample data
# with the stack running (below):
cd e2e && pnpm exec playwright test tests/70-capture-demo-snapshot.spec.ts   # rewrites apps/web/public/demo/snapshot.json
```

Preview the demo build locally: `cd apps/web && NEXT_PUBLIC_DEMO=1 NEXT_DIST_DIR=.next-demo pnpm build && NEXT_PUBLIC_DEMO=1 NEXT_DIST_DIR=.next-demo pnpm exec next start --port 3456`.

## Quick start

Prerequisites: **Docker Desktop (running)**, **Node 22+**, **pnpm 10** (`corepack enable`), **Python 3.12**, and Git Bash or WSL on Windows.

```bash
git clone https://github.com/bharat3645/CBT.git && cd CBT
pnpm install

# paper parser (python-docx / pdfplumber; Docling is optional and heavy)
python -m venv services/docparse/.venv
services/docparse/.venv/bin/pip install -r services/docparse/requirements.txt     # Windows: .venv/Scripts/pip

demo/start-stack.sh        # docker services, migrate, seed, docparse, api, worker, web
pnpm demo:reset            # optional: believable Demo Academy data (use before a demo)
```

Open <http://localhost:3000> and log in with any account in [Demo accounts](#demo-accounts).
Other URLs: API health <http://localhost:4000/api/v1/health>, outgoing email (Mailpit) <http://localhost:8025>.
Logs are in `.logs/`. Stop with `docker compose down` and end the node and python processes.

### What starts

| Service | Port | Notes |
| --- | --- | --- |
| web (Next.js 15) | 3000 | all four role apps and the live exam; proxies `/api/*` to the API |
| api (NestJS) | 4000 | REST `/api/v1`, Better Auth at `/api/v1/auth`, Postgres row-level security |
| worker (BullMQ) | n/a | parse, evaluate, rank, notify, exam auto-submit sweep |
| docparse (FastAPI) | 8000 | paper to question drafts |
| Postgres + pgvector, Valkey, SeaweedFS (S3), Gotenberg, ClamAV, Mailpit | docker compose | Gotenberg (PDF) listens on 3100, so do not run anything else there |

### Configuration

All configuration is environment variables, validated once at boot by `packages/config` (`loadEnv`). The defaults are the local-development values, so no `.env`
is needed locally. Copy [`.env.example`](.env.example) to change anything; it documents every variable. In production `BETTER_AUTH_SECRET` must be set to a real secret or the API refuses to start.
The web app reads `API_ORIGIN` (where `/api/*` is proxied), `NEXT_PUBLIC_API_URL`, `AUTH_REQUIRED`, and `NEXT_PUBLIC_DEMO` (hosted demo build).

## Everyday commands

```bash
pnpm typecheck                         # all packages
pnpm test                              # unit + API + tenant-isolation tests (PGlite, no services needed)
pnpm --filter api exec vitest run test/isolation   # calls every endpoint as another institute
pnpm e2e                               # real-browser journeys (stack must be running)
pnpm --filter @cbt/db db:generate      # after editing packages/db/src/schema (append one export to schema/index.ts)
pnpm --filter @cbt/db db:migrate       # also applies RLS and audit triggers
pnpm --filter api seed                 # base data; pnpm demo:reset for the full demo institute
```

Real-browser specs write screenshots to `demo/screenshots/`. `01` login, `02/04` paper ingestion, `03` live exam and results, `10` test assignment, `20/50/51/52` page crawl, API sweep and UI flows,
`55` super admin, `65` attendance/feedback/practice, `70` demo snapshot capture, `71` hosted-demo smoke test (`WEB_URL=http://localhost:3456`).

## Features

| Area | What it does |
| --- | --- |
| Paper ingestion | Upload DOCX/PDF, virus scan, rule-based segmenter, side-by-side review editor with confidence and flags; a paper with open flags or a missing key cannot be approved |
| Question bank | Rich text with LaTeX maths, MCQ single/multi, numeric with tolerance, difficulty, topic tags, version history |
| CBT engine | Presets (NTA, private-university MCQ, practice), server-driven timer, 5-state palette, offline autosave, strict-mode incidents, resume, auto-submit |
| Evaluation | Marking engine (+4/-1 etc.), section scores, topic analysis, test and batch ranks with percentiles, PDF report |
| Attendance | Teachers mark present/absent/late/excused per batch and day; absences notify the student and parents; parents see a percentage and history |
| Feedback | Teachers write feedback; students and linked parents are notified and can read it |
| Practice | Topic-based practice sets; answers are checked on the server, so the key is never sent to the browser in advance |
| Syllabus | Exam > subject > unit > chapter > topic, per-batch progress |
| Multi-tenancy | Postgres row-level security on every tenant table, insert-only audit log, a test that attacks every endpoint as another institute |
| Super admin | Institutes sign up as pending; the platform owner approves, suspends or reactivates them |

Not built (later phases): phone/OTP login, 2FA, impersonation, subjective-question marking, proctoring and lockdown. See [docs/demo.md](docs/demo.md#known-limits-be-upfront-in-a-demo).

## Repository layout

```
apps/
  api/        NestJS REST API (/api/v1): one Nest module per area under src/modules, Better Auth, CASL, Drizzle + RLS
  worker/     BullMQ worker: parse, evaluate, rank, notify, auto-submit sweep
  web/        Next.js 15 app
    src/app          routes only (thin files that mount a feature page)
    src/features     one folder per domain (attendance, cbt, results, ...): api hooks, components, pages
    src/components   shared UI (app shell, nav, dashboard kit, ui-kit)
    src/lib          api-client (the one transport), auth-client, casl, demo mock
packages/
  abilities/  role permissions (CASL)      contracts/  shared Zod schemas (subpath exports)
  config/     env parsing                  db/         Drizzle schema, migrations, RLS
  marking/    pure marking and rank engine ui/         shared UI components and theme tokens
services/
  docparse/   FastAPI paper parser
e2e/          Playwright journeys
demo/         sample papers, generators, start-stack.sh
docs/         guides, PRD, SRS
docker/       dev config for compose services
```

Conventions: files are kebab-case; every API call from the web goes through `lib/api-client.ts` (consistent `ApiError`, FormData support); every API error goes through
one global exception filter (`apps/api/src/common/http-exceptions.filter.ts`: Zod issues become 400, Postgres errors are mapped); every new route needs a case in
`apps/api/test/isolation/cases.ts` or the route-coverage test fails.

## Design system

The look is Hallmark's "Coral" theme (warm paper, cotton cards, an ink sidebar, one coral signal for the settled state), applied through tokens only:
`packages/ui/src/theme.css` holds every colour, shadow and radius, and `apps/web/src/components/stationery.tsx` builds the question paper, result sheet and teacher's note
shown on the landing and sign-in pages from real seeded data. General Sans is self-hosted in `apps/web/src/app/fonts` (Fontshare, free for commercial use); figures use Geist Mono.
Components never use colour literals, labels are sentence case, and the exam palette colours are reserved for meaning.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `docker ... dockerDesktopLinuxEngine ... cannot find the file` | Start Docker Desktop and wait until it is running |
| `EADDRINUSE ... :3100` | Port 3100 is Gotenberg's (docker compose). Run other servers on a different port, e.g. `--port 3456` |
| Web returns 500 on every page after a production build | A `next build` replaced `.next` under the dev server. Delete `apps/web/.next` and restart `pnpm --filter web dev`. Use `NEXT_DIST_DIR=.next-demo` for demo builds |
| Uploaded paper stays "parsing" | docparse is not running: start it as in `demo/start-stack.sh`, then re-upload |
| Login works but pages are empty | Run `pnpm demo:reset` |

## Documentation

- [Getting started and troubleshooting](docs/getting-started.md) · [Demo script and known limits](docs/demo.md) · [Architecture](docs/architecture.md) · [Testing](docs/testing.md)
- [Feature checklist](docs/feature-checklist.md) (every page and endpoint, how it is verified)
- [Product requirements (PRD)](docs/PRD.md), [SRS](docs/SRS.pdf) · [Contributor and agent notes](CLAUDE.md)

## Licensing rule

Closed-source SaaS: no AGPL/GPL code is linked into app code. Copyleft tools (ClamAV) run only as separate unmodified services.

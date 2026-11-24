# PrepDesk CBT

A multi-tenant computer-based-test (CBT) platform for entrance-exam coaching institutes.
Teachers upload a Word/PDF question paper, review the auto-segmented questions, publish a timed test to batches,
students sit it in an NTA-style exam screen, and results, ranks and PDF reports are produced automatically.

> Status: working local POC covering the whole MVP flow. See [what is and is not built](docs/demo.md#known-limits-be-upfront-in-a-demo).

## Quick start (about 10 minutes)

Prerequisites: Docker Desktop (running), Node 22+, pnpm 10, Python 3.12, Git Bash or WSL on Windows.

```bash
git clone https://github.com/bharat3645/CBT.git && cd CBT
pnpm install
python -m venv services/docparse/.venv
services/docparse/.venv/bin/pip install -r services/docparse/requirements.txt   # Windows: .venv/Scripts/pip
demo/start-stack.sh        # docker services, migrate, seed, docparse, api, worker, web
```

Open http://localhost:3000 and sign in (password `Passw0rd!Passw0rd`):

| Role | Login |
| --- | --- |
| Admin | `admin@demo.test` |
| Teacher | `teacher@demo.test` |
| Student | `student@demo.test` |
| Parent | `parent@demo.test` |

Then follow the [demo script](docs/demo.md). To stop: `docker compose down` and end the node/python processes (logs are in `.logs/`).

## Verify it works

```bash
pnpm typecheck     # all packages
pnpm test          # unit and API tests (PGlite, no services needed)
pnpm e2e           # real-browser journeys (needs the stack running)
```

## Repository layout

```
apps/
  api/        NestJS REST API (/api/v1), Better Auth, CASL, Drizzle + Postgres RLS
  worker/     BullMQ worker: parse, evaluate, rank, notify, auto-submit sweep
  web/        Next.js 15 app: admin, teacher, student, parent, live exam screen
packages/
  abilities/  role permissions (CASL)      contracts/  shared Zod schemas
  config/     env parsing                  db/         Drizzle schema, migrations, RLS
  marking/    pure marking/rank engine     ui/         shared UI components and theme
services/
  docparse/   FastAPI paper parser (python-docx, pdfplumber; Docling optional)
e2e/          Playwright journeys (screenshots to demo/screenshots)
demo/         sample papers, generators, start-stack.sh
docs/         guides, PRD, SRS
docker/       dev config for compose services
```

## Documentation

- [Getting started and troubleshooting](docs/getting-started.md)
- [Demo script and known limits](docs/demo.md)
- [Architecture](docs/architecture.md)
- [Testing](docs/testing.md)
- [Product requirements (PRD)](docs/PRD.md), [SRS](docs/SRS.pdf)
- [Contributor and agent notes](CLAUDE.md)

## Licensing rule

Closed-source SaaS: no AGPL/GPL code is linked into app code. Copyleft tools (ClamAV) run only as separate unmodified services.

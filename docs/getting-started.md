# Getting started

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Docker Desktop | recent | must be running; provides Postgres, Valkey, SeaweedFS, Gotenberg, ClamAV, Mailpit |
| Node.js | 22+ | |
| pnpm | 10 | `corepack enable` |
| Python | 3.12 | for the docparse service |

## Run

```bash
pnpm install
python -m venv services/docparse/.venv
services/docparse/.venv/bin/pip install -r services/docparse/requirements.txt
demo/start-stack.sh
```

The script starts the docker services, applies migrations (including row-level security and audit triggers), seeds demo
data, then launches docparse (:8000), API (:4000), worker and web (:3000) in the background. Logs go to `.logs/`.

| URL | What |
| --- | --- |
| http://localhost:3000 | web app |
| http://localhost:4000/api/v1/health | API health |
| http://localhost:8025 | Mailpit (captured email) |

Demo users: `admin|teacher|student|parent@demo.test`, password `Passw0rd!Passw0rd`. These are seed data for local use only.

### Clean demo data

```bash
pnpm demo:reset
```

Wipes every tenant row (Demo Academy plus anything e2e runs created: tests, papers, users, notifications) and reseeds the
realistic "Demo Academy" dataset in a few seconds. The schema, the super admin, global syllabus templates and the insert-only audit
log are kept. It refuses to run unless `DATABASE_URL` points at localhost. Everyone is logged out (sessions are deleted), so sign in
again. `pnpm --filter api seed` alone is idempotent and does not wipe anything. Test dates are relative to the moment you reset, so
reset again before a demo if the data is more than a few days old.

## Configuration

Defaults work for local use. Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to
`apps/web/.env.local` to change them. Change `BETTER_AUTH_SECRET` and the super-admin password for anything beyond local use.
Role pages require a session by default (set `AUTH_REQUIRED=0` in the web env to disable the redirect for local hacking).

## Word equations (OMML) and Docling

Word equation objects are converted to LaTeX natively by docparse (`docparse/omml.py`, pure python via python-docx/lxml). No Docling install is needed: `DOCPARSE_USE_DOCLING=false` is the supported default. Equations appear as `$...$` in the question and option text, in reading order, including inside table cells. A display equation alone in its paragraph becomes `$\displaystyle ...$`.

Covered: fractions (bar, linear, binomial), super/subscripts (including both and pre-scripts), roots and nth roots, n-ary operators with limits (integrals, sums, products, unions), delimiters (parens, brackets, braces, bars, floors, angle brackets), function names and limits, accents (hat, tilde, bar, dot, vector, etc.), bars and over/under-braces, boxes, matrices, equation arrays, Greek letters and common operators/relations/arrows/set symbols, unicode super/subscript digits.
Not covered: equations embedded as images or legacy MathType/Equation Editor OLE objects (these need Docling or manual entry), `m:eqArr` alignment markers (rows are stacked, `&` alignment is dropped), custom matrix brackets beyond the surrounding `m:d`, exotic styles (script, fraktur, bold-italic variants are rendered as plain letters), and equations in headers, footnotes or text boxes. PDF equations are not converted (pdfplumber extracts plain text only).

Optional: Docling still adds layout-aware extraction for PDFs. `pip install -r services/docparse/requirements-docling.txt`, then start docparse with `DOCPARSE_USE_DOCLING=true`. This is not exercised by the tests.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| API cannot connect to Postgres/Valkey | start Docker Desktop, then `docker compose up -d` |
| Upload stuck at "scanning" | ClamAV needs a minute or two to load signatures on first start |
| Bucket / S3 AccessDenied | SeaweedFS needs `docker/seaweedfs-s3.json`; recreate the container |
| Port already in use | stop the old node/python processes (3000, 4000, 8000) |
| Login redirects back | check the API is healthy at `/api/v1/health` |

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

## Configuration

Defaults work for local use. Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to
`apps/web/.env.local` to change them. Change `BETTER_AUTH_SECRET` and the super-admin password for anything beyond local use.
Set `AUTH_REQUIRED=1` in the web env to require a session for role pages.

## Optional: Docling (Word equations to LaTeX)

`pip install -r services/docparse/requirements-docling.txt`, then start docparse with `DOCPARSE_USE_DOCLING=true`.
This path is not exercised by the tests; the default parses LaTeX typed as `$...$`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| API cannot connect to Postgres/Valkey | start Docker Desktop, then `docker compose up -d` |
| Upload stuck at "scanning" | ClamAV needs a minute or two to load signatures on first start |
| Bucket / S3 AccessDenied | SeaweedFS needs `docker/seaweedfs-s3.json`; recreate the container |
| Port already in use | stop the old node/python processes (3000, 4000, 8000) |
| Login redirects back | check the API is healthy at `/api/v1/health` |

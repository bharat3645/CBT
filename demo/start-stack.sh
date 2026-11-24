#!/usr/bin/env bash
# Starts the whole POC locally (Git Bash / WSL). Prereqs: Docker Desktop running, Node 22+, pnpm, Python 3.12.
# One-time:  pnpm install && python -m venv services/docparse/.venv && services/docparse/.venv/Scripts/pip install -r services/docparse/requirements.txt
#            (Docling is heavy; for the POC the light path works: DOCPARSE_USE_DOCLING=false uses python-docx/pdfplumber.)
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -x services/docparse/.venv/bin/python ]; then DEFAULT_PY=services/docparse/.venv/bin/python; else DEFAULT_PY=services/docparse/.venv/Scripts/python.exe; fi
PY="${DOCPARSE_PY:-$DEFAULT_PY}"
LOGS="${LOGS:-.logs}"; mkdir -p "$LOGS"

docker compose up -d postgres valkey seaweedfs gotenberg mailpit clamav
echo "waiting for postgres..."; until docker compose exec -T postgres pg_isready -U cbt >/dev/null 2>&1; do sleep 1; done

pnpm --filter @cbt/db db:migrate
pnpm --filter api seed

(cd services/docparse && DOCPARSE_USE_DOCLING=false nohup "../../$PY" -m uvicorn docparse.main:app --port 8000 > "../../$LOGS/docparse.log" 2>&1 &)
(nohup pnpm --filter api dev    > "$LOGS/api.log"    2>&1 &)
(nohup pnpm --filter worker dev > "$LOGS/worker.log" 2>&1 &)
(nohup pnpm --filter web dev    > "$LOGS/web.log"    2>&1 &)

echo "web http://localhost:3000   api http://localhost:4000/api/v1/health   mailpit http://localhost:8025"
echo "logins: admin|teacher|student|parent@demo.test / Passw0rd!Passw0rd"

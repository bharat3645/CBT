# PrepDesk CBT platform: runnable POC

Everything below runs locally. `demo/start-stack.sh` starts it; `pnpm --filter e2e test` (from the repo root) replays the
whole story in a real browser (Playwright) and writes screenshots to `demo/screenshots/`.

## Services

| Service | Port | Notes |
| --- | --- | --- |
| web (Next.js) | 3000 | all four role apps, proxies `/api/*` to the API |
| api (NestJS) | 4000 | `/api/v1/health`, Better Auth at `/api/v1/auth` |
| worker (BullMQ) | n/a | parse, evaluate, rank, notify, auto-submit sweep |
| docparse (FastAPI) | 8000 | `DOCPARSE_USE_DOCLING=false` in the POC (python-docx/pdfplumber path) |
| Postgres+pgvector, Valkey, SeaweedFS (S3), Gotenberg, ClamAV, Mailpit | docker compose | SeaweedFS uses a dev-only identity (`docker/seaweedfs-s3.json`) |

Demo logins (password `Passw0rd!Passw0rd`): `admin@`, `teacher@`, `student@`, `parent@demo.test`.

## Demo script (what the e2e specs do)

1. **Login per role** lands on that role's dashboard (`01-login`).
2. **Teacher uploads `demo/sample-paper.docx`**: ClamAV scan, S3 storage, worker calls docparse, 12 questions with maths and the
   answer key appear in the side-by-side review editor; approve, and the questions land in the bank (`02-ingestion`).
3. **Messy paper `demo/flawed-paper.docx`**: flags (too few options, no options, missing key); *Approve* is blocked with the
   422 reason; teacher fixes and approves (`04-flagged-paper`).
4. **Test wizard** assigns the test to a batch; the student sees it under *Upcoming*; a student outside the batch gets 403
   (`10-test-assignment`).
5. **Live exam as student**: server timer, 5-state palette, KaTeX maths, autosave with sequence numbers, strict-mode
   incident, reload and resume, submit with receipt (`03-exam`).
6. **Evaluation**: worker marks it with the NTA preset (+4 / -1), ranks it, result page shows score, sections, rank (labelled a
   mock rank), PDF report via Gotenberg, and an in-app notification (`03-exam`).

## Known limits (be upfront in a demo)

- Docling (Word equation to LaTeX) is not exercised: the POC parses LaTeX typed as `$...$` in the DOCX.
- Questions promoted from papers have no syllabus topics, so topic analytics show "Untagged" until topics are tagged.
- Not built: phone/OTP login, 2FA, impersonation, subjective-question marking, attendance, proctoring and lockdown (Phases 2 to 4).
- Dev servers hot-reload; run the stack from a quiet tree for e2e.

## Mobile

Checked at 390px width (e2e/tests/30-mobile.spec.ts): no horizontal overflow on admin, teacher and student key pages. Screenshots are in demo/screenshots/mobile-*.png.

# PrepDesk CBT platform: runnable POC

Everything below runs locally. `demo/start-stack.sh` starts it; `pnpm e2e` replays the
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

## Demo data (`pnpm demo:reset`)

Run `pnpm demo:reset` before a demo (and after e2e runs) to get a believable coaching institute instead of test junk. The seed
(`apps/api/src/seed-demo.ts`, question bank in `seed-demo-bank.ts`) creates, for Demo Academy:

- **3 batches**: JEE-2026-A (10 students incl. `student@demo.test`), NEET-2026-B (8), Foundation-9 (7). 3 teachers (`teacher@` plus
  Dr. Meera Iyer and Rohan Kulkarni, all password `Passw0rd!Passw0rd`), 5 parents with verified links (`parent@` is linked to the demo student).
- **Syllabus** (JEE Main 2026: Physics/Chemistry/Maths, 22 topics) with per-batch progress (about 75% / 50% / 30% complete).
- **60 approved questions** (20 per subject, MCQ and numeric, easy/medium/hard, LaTeX in stems and options), each tagged to a topic.
- **6 tests**: 4 closed with evaluated attempts (47 evaluations from the real marking engine: NTA +4/-1, practice 1/0), ranks at test and
  batch level with percentiles, section scores and per-topic items; 1 live now (3 students mid-exam); 1 upcoming (JEE Main Mock 3).
  The demo student has 3 released results, a class rank, and deliberate weak topics (organic effects, hybridisation, area under curves).
- **Flags and review queue**: 2 papers awaiting approval (one with open flags and a missing key, one clean), 3 strict-mode incident
  attempts (one flagged), and in-app notifications for every role.

Caveats: the approved-paper source files are not in object storage, so "view original" on those papers has nothing to show. The
upcoming and live tests follow the clock, so reset again if the window has passed.

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
7. **Phase 2** (`65-phase2`): teacher marks attendance and writes feedback; the parent sees both; the student runs a practice set.
6. **Evaluation**: worker marks it with the NTA preset (+4 / -1), ranks it, result page shows score, sections, rank (labelled a
   mock rank), PDF report via Gotenberg, and an in-app notification (`03-exam`).

## Known limits (be upfront in a demo)

- Word equations (OMML) are converted to LaTeX natively without Docling (see `docs/getting-started.md` for coverage and gaps; try `demo/equation-paper.docx`, built by `demo/make_equation_paper.py`). Equation images, MathType/OLE objects and PDF equations are not converted.
- Questions promoted from papers have no syllabus topics (paper sections are subjects, not topics), so they show as "Untagged" until tagged by hand. The seeded demo bank is already tagged.
- Built in Phase 2: attendance (teacher marks, parent sees %), teacher feedback (student and parent notified), practice sets (server-checked).
- Not built: phone/OTP login, 2FA, impersonation, subjective-question marking, proctoring and lockdown (Phases 3 and 4).
- Dev servers hot-reload; run the stack from a quiet tree for e2e.

## Mobile

Checked at 390px width (e2e/tests/30-mobile.spec.ts): no horizontal overflow on admin, teacher and student key pages. Screenshots are in demo/screenshots/mobile-*.png.

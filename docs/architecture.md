# Architecture

```
Browser (Next.js) --/api/*--> NestJS API --> Postgres (RLS)
                                  |--> Valkey/BullMQ --> Worker --> docparse, Gotenberg
                                  |--> SeaweedFS (S3), ClamAV, Mailpit
```

- **Modular monolith API** (`apps/api/src/modules/*`): identity, people, exams, questions, syllabus, ingestion, results,
  notifications, analytics, dashboard. REST under `/api/v1`, Better Auth under `/api/v1/auth`.
- **Tenant isolation:** every tenant table has an `institute_id` and a Postgres RLS policy; requests run in a transaction as the
  non-bypass role `cbt_app`. An isolation test calls every route as another institute. The audit table is insert-only via triggers.
- **Authorization:** CASL abilities per role (`packages/abilities`), applied with `@Can`.
- **Slow work is queued:** the API writes to Postgres and enqueues BullMQ jobs; the worker parses papers, evaluates, ranks,
  notifies and auto-submits expired attempts. The worker connects as DB owner, so every query filters by `institute_id`.
- **Adapters:** storage, PDF, queue and notifier sit behind our own interfaces; business code never imports vendor SDKs.
- **Paper ingestion:** original stored untouched, ClamAV scan, docparse, rule-based segmenter, review editor. A paper with an open
  flag or missing answer key cannot be approved (HTTP 422). Approval promotes drafts to the question bank.
- **Exam engine:** presets (NTA, private MCQ, practice) are data. The timer is server-authoritative; answers are saved idempotently
  with sequence numbers and a Dexie offline outbox; strict mode records tab-visibility incidents.
- **Marking:** `packages/marking` is pure and tested. The test preset's marking (+4/-1 for NTA) overrides per-question marks.
- **Licensing:** no AGPL/GPL in app code (PyMuPDF, MinIO CE and Redis 8 were rejected on purpose).

More detail and intent: [PRD](PRD.md).

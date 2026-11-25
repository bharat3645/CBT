# Feature checklist

Inventory of every page and API endpoint, how each is verified, and its status. Generated from `apps/web/src/app/**/page.tsx`, the `*.controller.ts` files and `apps/api/test/isolation/cases.ts`.

How to re-verify (stack running, see `demo/README.md`):

```
cd e2e
PLAYWRIGHT_BROWSERS_PATH=C:/pw-browsers pnpm exec playwright test tests/5*.spec.ts --output=C:/tmp/pw-crawl --reporter=line
```

Verification keys:

- **crawl** = `50-crawl-pages.spec.ts`: logs in as the role, opens the page (dynamic ids discovered through the API), asserts it renders (no error overlay, not blank), records console errors, page errors and unexpected HTTP >= 400, clicks every harmless button/tab, and follows every internal link once.
- **sweep** = `51-api-sweep.spec.ts`: valid payload as the right role (2xx), then 401 unauthenticated and 403 for roles that must not have access.
- **flow** = `52-ui-flows.spec.ts`: real UI create/edit/delete flows. Older flows: `01-04`, `10`, `20`, `30`, `40`.
- **isolation** = `apps/api/test/isolation` (Institute B against Institute A's data; route-coverage test).

Status: OK = verified green. STUB = deliberately not built, page shows a clear "Phase 2" card.

## Pages

| Area | Page | Role | How verified | Status |
| --- | --- | --- | --- | --- |
| Public | `/` | anon | crawl | OK |
| Auth | `/login` | anon | crawl, flow (wrong password, role landing in 01-login) | OK |
| Super admin | `/superadmin` (platform overview), `/superadmin/institutes` (list, Approve / Suspend / Reactivate) | super admin | e2e `55-superadmin` (signup -> approve -> new admin logs in, empty dashboard, creates a batch) | OK |
| Auth | `/signup` (registers an institute, status pending) | anon | crawl, flow, sweep (`POST /institutes`) | OK |
| Admin | `/admin` dashboard | admin | crawl, 20 | OK |
| Admin | `/admin/batches` (create) | admin | crawl, 20 | OK |
| Admin | `/admin/batches/[batchId]` (roster, enrol/remove student, archive, syllabus progress) | admin | crawl, 20, flow | OK |
| Admin | `/admin/students` (add form, CSV import, search) | admin | crawl, 20 | OK |
| Admin | `/admin/teachers` (add form, CSV import) | admin | crawl, flow | OK |
| Admin | `/admin/parents` (add form with child link, manage children) | admin | crawl, 20, flow | OK |
| Admin | `/admin/syllabus` (copy template, add exam, add/rename/delete node) | admin | crawl, 20, flow | OK |
| Admin | `/admin/question-bank` | admin | crawl, 02, 40 | OK |
| Admin | `/admin/questions/new`, `/admin/questions/[id]` | admin | crawl, 40 | OK |
| Admin | `/admin/papers`, `/admin/papers/[paperId]` | admin | crawl, 02, 04 | OK |
| Admin | `/admin/flags` | admin | crawl, flow | OK |
| Admin | `/admin/tests` (list, edit, cancel) | admin | crawl, flow, 10 | OK |
| Admin | `/admin/tests/[testId]/leaderboard` | admin | crawl, sweep | OK |
| Admin | `/admin/results` (CSV export) | admin | crawl, flow | OK |
| Admin | `/admin/reports` (+ every report card link) | admin | crawl, flow | OK |
| Admin | `/admin/settings` (branding, brand colour) | admin | crawl, 20 | OK |
| Teacher | `/teacher` | teacher | crawl, 01 | OK |
| Teacher | `/teacher/batches`, `/teacher/batches/[batchId]` | teacher | crawl | OK |
| Teacher | `/teacher/papers/upload`, `/needs-review`, `/approved`, `/[paperId]` | teacher | crawl, 02, 04 | OK |
| Teacher | `/teacher/question-bank`, `/questions/new`, `/questions/[id]` | teacher | crawl, 40 | OK |
| Teacher | `/teacher/syllabus` | teacher | crawl, 20 | OK |
| Teacher | `/teacher/tests` (wizard), `/teacher/tests/[testId]/leaderboard` | teacher | crawl, 10 | OK |
| Teacher | `/teacher/insights` | teacher | crawl | OK |
| Teacher | `/teacher/attendance` (batch + date roster, mark present/absent/late/excused; absences notify student and parents) | teacher | crawl, flow, 65 | OK |
| Teacher | `/teacher/feedback` (write feedback; student and linked parents notified) | teacher | flow, 65 | OK |
| Student | `/student` | student | crawl, 01 | OK |
| Student | `/student/tests/upcoming` | student | crawl, 10 | OK |
| Student | `/student/tests/results`, `/results/[attemptId]` (score, rank, PDF) | student | crawl, 03, flow | OK |
| Student | `/student/tests/[testId]/leaderboard` (own row only) | student | crawl, sweep | OK |
| Student | `/student/weak-topics`, `/student/syllabus` | student | crawl, flow | OK |
| Student | `/student/practice` | student | crawl, flow, 65 | OK (topic practice sets, answers checked server-side, key never sent in advance) |
| Exam | `/exam/[testId]` (live exam, timer, palette, autosave, strict mode, resume, submit) | student | 03, 10 | OK |
| Parent | `/parent`, `/parent/results`, `/parent/results/[attemptId]`, `/parent/syllabus` | parent | crawl, 20, flow | OK |
| Parent | `/parent/attendance`, `/parent/feedback` (child attendance %, recent days, teacher feedback, notices) | parent | crawl, flow, 65 | OK |
| Shell | header search (jump to page), notifications bell, mark all read, sign out, child switcher | all | flow | OK |

(Phase 2 is now built; no page is a stub any more.)

## API endpoints

All verified by **sweep** (2xx as the right role, 401 anonymous, 403 for wrong roles) and listed in the **isolation** cases unless noted.

| Area | Endpoint | Allowed roles | Status |
| --- | --- | --- | --- |
| Health | `GET /api/v1/health` | public | OK |
| Auth | `/api/v1/auth/*` (Better Auth sign-in/out/sign-up) | public | OK (used by every login) |
| Identity | `GET /me` | any | OK |
| Identity | `POST /institutes` (public registration, throttled 5/min) | public | OK |
| Identity | `GET /institutes`, `GET /institutes/:id`, `POST /institutes/:id/approve\|suspend\|reactivate\|deactivate` | super admin | 403 for institute roles verified; list now also returns `adminEmail` + `counts`; 2xx path exercised by e2e `55-superadmin` (approve) and `m1-m2.test.ts` |
| Identity | `GET/PATCH /institute` | admin (PATCH), staff (GET) | OK |
| Audit | `GET /audit-logs` | admin | OK |
| Dashboard | `GET /dashboard`, `GET /children` | all / parent | OK |
| People | `GET/POST /users`, `GET/PATCH/DELETE /users/:id` | admin (teacher: read) | OK |
| People | `GET/POST /guardian-links`, `DELETE /guardian-links/:guardianId/:studentId` | admin | OK |
| People | `GET/POST /batches`, `GET/PATCH/DELETE /batches/:id` | admin (read: teacher, student own) | OK |
| People | `POST/DELETE /batches/:id/students[/:studentId]`, `POST/DELETE /batches/:id/teachers[/:teacherId]` | admin | OK |
| People | `GET /imports/users/template`, `POST /imports/users`, `GET /imports/:id`, `GET /imports/:id/errors.csv` | admin | OK |
| Syllabus | `GET /syllabus/tree`, `/templates`, `POST /templates/copy`, `POST/PATCH/DELETE /nodes`, `POST /materials`, `GET /topics/:id/materials`, `GET/PUT /batches/:id/progress[/:topicId]` | admin/teacher (read: student, parent) | OK |
| Questions | `GET /questions`, `POST /questions/duplicates`, `POST /questions`, `GET/PUT /questions/:id`, `GET /:id/versions[/:v]` | admin, teacher | OK (students and parents 403) |
| Ingestion | `POST /ingestion/papers`, `GET /ingestion/papers[/:id]`, `PATCH /:id/drafts/:draftId`, `PUT /:id/answer-key`, `POST /:id/approve` | admin, teacher | OK (students and parents 403, approval gate 422) |
| Exams | `GET /exam-presets`, `GET /tests`, `POST /tests`, `PATCH /tests/:id`, `POST /tests/:id/publish`, `POST /tests/:id/cancel` | admin, teacher (batch scope) | OK |
| Exams | `GET /tests/upcoming`, `POST /tests/:id/attempts`, `GET /attempts/:id/questions`, `POST /attempts/:id/answers`, `/incidents`, `/submit` | student | OK (answer key never sent, replay is idempotent) |
| Results | `GET /results/mine`, `GET /results/:attemptId`, `GET /results/:attemptId/report.pdf` | student, parent (linked child), staff | OK |
| Results | `GET /tests/:id/leaderboard` | staff (all rows with names), student (own row) | OK |
| Results | `PUT /tests/:id/result-settings`, `POST /tests/:id/results/release`, `POST /tests/:id/answer-key/corrections` | admin, teacher | OK |
| Analytics | `GET /analytics/batch`, `/batch.csv`, `/students/:id`, `/me` | staff / own / linked child | OK |
| Notifications | `GET /notifications`, `/unread-count`, `POST /read-all`, `POST /:id/read`, `GET/PUT /preferences` | any | OK |

## Deliberately not built (Phase 2 and later)

Attendance, teacher feedback, self-paced practice sets, phone/OTP login, 2FA, impersonation, subjective-question marking, proctoring and lockdown, Docling-based PDF equation conversion (DOCX Word equations are handled natively, see `docs/getting-started.md`).

| Phase 2 | `GET/PUT /attendance*`, `GET/POST /feedback*`, `GET /practice/topics|set|stats`, `POST /practice/check` | teacher/admin (attendance, feedback write), student (practice), parent+student (read own/child) | OK (isolation cases + 65) |

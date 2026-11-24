# Exam Prep Platform — Build PRD (Open-Source Building Blocks)

Nov 23, 2026 · @Astraon Labs

## Summary

Assemble the platform's plumbing from about 30 permissively licensed open-source blocks, and hand-build only the four parts that make it different: the paper-to-question segmenter, the conversion review editor, the CBT engine, and evaluation with ranking. On the spec's own MVP estimate of 180–260 dev-days, this should bring the MVP to roughly 135–195 dev-days (a rough guess, same ±40% uncertainty).

**Working assumptions** (confirmed or assumed on 23 Nov 2026):

- **Team:** 2 TypeScript full-stack developers plus a small Python service, as the spec proposes. *Assumed; not confirmed.*
- **Hosting:** self-hosted on a VPS in an Indian region, Docker everywhere, no managed cloud services. *Confirmed.*
- **Licensing:** closed-source SaaS, so no AGPL or GPL code is linked into our own code. Copyleft tools are allowed only as separate, unmodified services or as dev tools. *Confirmed.*
- **Pilot exam pattern:** not decided. The CBT engine is built configurable, with an NTA-style preset as the default. *Open; blocks the pilot.*

**Headline stack**

- **Web:** Next.js, TypeScript, Tailwind, shadcn/ui (its sidebar component matches the Dribbble direction).
- **API:** NestJS modular monolith, Drizzle ORM with Postgres row-level security, Better Auth for login and institutes, CASL for permissions.
- **Jobs and cache:** BullMQ on Valkey.
- **Paper parsing:** Python FastAPI service around Docling, which converts Word equations to LaTeX.
- **Question editor:** Tiptap with its MIT mathematics extension, MathLive for maths input, KaTeX for rendering.
- **Files, PDFs, ops:** SeaweedFS (S3-compatible storage), Gotenberg (PDF reports), Coolify (deploys), GlitchTip (errors), pgBackRest (backups).

What stays custom, and why: the exam loop is the product. No open-source exam engine fits a closed SaaS with this marking, ranking and strict-mode design, so those modules are written by us on top of the blocks.

## Build vs assemble

The rule: build what the spec calls the core loop, assemble everything else, and put every block behind our own interface so it can be swapped later.

1. **Build** where the logic is the product: question segmentation rules, confidence flags, the review-and-approve flow, the exam timer and autosave protocol, strict mode, marking, ranks and recommendations.
2. **Assemble** where the problem is solved and generic: login, permissions, UI components, editors, maths, queues, storage, PDF output, notifications, monitoring, deploys.
3. **Wrap** each block in a thin adapter we own (for example `StorageService`, `PdfService`, `Notifier`, `DocParser`). Business code never imports a vendor SDK directly, so replacing SeaweedFS with S3, or our notifier with Novu, touches one file.

**Selection criteria every block had to pass**

| Criterion | Rule |
| --- | --- |
| License | MIT, Apache-2.0, BSD or MPL inside the app. AGPL or GPL only as an unmodified separate service or a dev tool. |
| Self-hostable | Runs in Docker on a single VPS with no paid control plane. |
| Stack fit | TypeScript for web and API, Python only inside the parsing service. |
| Maturity | Actively maintained in 2026, real production users, documented. |
| Replaceable | An open standard (S3 API, Sentry SDK protocol, Redis protocol, SQL) so we are never locked in. |

Blocks that failed a criterion are listed as rejected in the catalogue, with the reason.

## Reference architecture

The whole platform is one Next.js app, one NestJS API and one BullMQ worker, plus six off-the-shelf services. That is few enough moving parts for two developers to run on three VPSs.

&#91;embedded content: reference architecture · 1 API, 1 worker, 6 services\]

The API never does slow work inline. It writes to Postgres and puts jobs in Valkey, and the worker picks them up. The worker also reads and writes Postgres and Valkey; the lines show only the main calls.

**Exam-time path:**

1. The browser saves each answer with an attempt ID and sequence number. The API writes it to Postgres with an idempotent upsert.
2. The worker's sweep auto-submits expired attempts every 10–30 seconds.
3. Evaluation and ranking run as queued jobs, so a spike of 500 submissions never blocks the API.

## Building-block catalogue

These are the chosen blocks, one per job, grouped by layer. Licenses were checked in November 2026; re-check them at each major upgrade.

**Web app (students, parents, teachers, admins)**

| Job | Block | License | Why this one | Alternative or rejected |
| --- | --- | --- | --- | --- |
| App framework | Next.js + TypeScript | MIT | Spec choice; SEO for the landing page | — |
| UI kit and layout | [shadcn/ui](https://ui.shadcn.com/docs/components/sidebar) + Radix + Tailwind | MIT | Sidebar ships groups with labels, badges, nested submenus and an icon-collapse mode, which is the Dribbble sidebar | Mantine |
| Data tables | TanStack Table | MIT | Question bank, rosters, results with filters and bulk actions | AG Grid (paid features) |
| Forms and validation | React Hook Form + Zod | MIT | Zod schemas shared with the API | — |
| Charts | Recharts (shadcn charts) | MIT | Score trends, topic accuracy, distributions | ECharts |
| Question editor | [Tiptap v3](https://tiptap.dev/docs/editor/extensions/nodes/mathematics) + `@tiptap/extension-mathematics` | MIT | Rich text, tables, images; maths extension renders LaTeX with KaTeX | Lexical |
| Maths input | [MathLive](https://www.npmjs.com/package/mathlive) | MIT | Equation field with virtual keyboard, outputs LaTeX | MathQuill |
| Maths rendering | KaTeX | MIT | Fast, same renderer in editor, exam and PDF | MathJax |
| File upload | Uppy | MIT | Resumable uploads straight to storage with signed URLs | — |
| CSV/XLSX import | [react-spreadsheet-import](https://www.jsdelivr.com/package/npm/react-spreadsheet-import) | MIT | Column mapping and row validation for bulk users | Built on Chakra UI, so restyle it, or build on Papa Parse |
| Offline answer queue | Dexie (IndexedDB) | Apache-2.0 | Keeps answers when the network drops during a test | localStorage (too small, blocking) |
| Client state and fetching | Zustand + TanStack Query | MIT | Exam state machine; cached dashboard queries | Redux |

**API, workers and services**

| Job | Block | License | Why this one | Alternative or rejected |
| --- | --- | --- | --- | --- |
| API framework | NestJS | MIT | Modules map one-to-one to the spec's modular monolith | — |
| Database | PostgreSQL + `pg_trgm` + `pgvector` | PostgreSQL | One database for data, RLS, duplicate-question search | — |
| ORM and tenant isolation | [Drizzle ORM](https://orm.drizzle.team/docs/rls) | Apache-2.0 | Declares row-level security policies in the TypeScript schema | Prisma (weaker RLS story) |
| Login, sessions, institutes | [Better Auth](https://better-auth.com/docs/integrations/nestjs) + organization, admin, 2FA, phone-OTP plugins | MIT | Organization = institute, with members, invitations and custom roles | Keycloak (heavy Java service), managed Auth0/Clerk (not self-hosted) |
| Permissions | [CASL](https://github.com/stalniy/casl) | MIT | Same rules on server and UI; conditions like "own batch" or "linked child" | Hand-written guards |
| Job queue | BullMQ on [Valkey](https://redis.io/blog/what-is-valkey/) | MIT / BSD-3 | Auto-submit sweeps, evaluation, ranks, imports, notifications | Redis 8 (RSAL/SSPL/AGPL) rejected |
| Paper parsing | [Docling](https://mintlify.com/docling-project/docling/api/backends/docx) in a FastAPI service | MIT | Reads DOCX structure, tables and images, and converts Word equations (OMML) to LaTeX; also lays out PDFs | `omml2latex` as fallback for odd equations |
| PDF text with positions | pdfplumber, pypdfium2 | MIT / Apache-BSD | Option markers and two-column layouts; page images for the side-by-side view | [PyMuPDF rejected](https://pymupdf.readthedocs.io/en/latest/about.html): AGPL |
| OCR (Phase 3) | [PaddleOCR 3 + PP-FormulaNet](https://arxiv.org/html/2507.05595v1) | Apache-2.0 | Scanned pages and printed or handwritten formulas to LaTeX | Tesseract (weak on maths) |
| Object storage | [SeaweedFS](https://itsfoss.com/news/minio-moves-away-from-open-source/) | Apache-2.0 | S3-compatible, self-hosted | MinIO CE rejected (maintenance mode, no images); Garage is AGPL |
| Virus scan | ClamAV | GPL (separate daemon) | Scans every upload before parsing | — |
| PDF reports | [Gotenberg](https://pkg.go.dev/github.com/gotenberg/gotenberg/v8) | MIT | Chromium HTML to PDF over HTTP; reports reuse the web's KaTeX and charts | Puppeteer in-process |
| Notifications, MVP | Own module: outbox table + BullMQ + React Email | MIT | Dedupe key, retries, read/unread with no extra services | — |
| Notifications, Phase 2 | [Novu](https://docs.novu.co/platform/what-is-novu) self-hosted | MIT core (enterprise folder is commercial) | Inbox component, preferences, digests, SMS/WhatsApp providers | Needs MongoDB and several containers |
| Email delivery | A transactional email API | Paid service | Self-hosted SMTP from a VPS lands in spam | — |
| Webcam checks (Phase 3) | [MediaPipe Face Detector](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js) | Apache-2.0 | Runs in the browser; counts faces, no video upload needed | face-api.js |
| Lockdown browser (Phase 4) | [Safe Exam Browser](https://www.safeexambrowser.org/alliance/faq.html) | MPL | Real lockdown on Windows, macOS, iOS without us building per-OS apps | Custom Electron app |

**Operations and developer tooling**

| Job | Block | License | Why this one | Alternative or rejected |
| --- | --- | --- | --- | --- |
| Deploys on VPS | [Coolify](https://contabo.com/blog/blog-coolify-vs-dokploy-comparison) | Apache-2.0 | Git push deploys, TLS, one-click Postgres/Valkey; keep the dashboard off the public internet | Dokploy (mixed license) |
| Error tracking | [GlitchTip](https://railway.com/deploy/glitchtip-railway) | MIT | Accepts the standard Sentry SDKs; light enough for a small VPS | Self-hosted Sentry (40+ containers) |
| Uptime checks | Uptime Kuma | MIT | Status page and alerts during exam windows | — |
| Database backups | pgBackRest | MIT | Daily full + WAL archiving to off-site S3, meets RPO 15 min | WAL-G |
| Monorepo | Turborepo + pnpm | MIT | One repo for web, API, worker, shared types | Nx |
| Tests | Vitest, Playwright | MIT / Apache-2.0 | Unit tests and the 25 acceptance tests as end-to-end runs | — |
| Load tests | k6 | AGPL (dev tool, never shipped) | The 500-concurrent-student test | Artillery |
| Local email | Mailpit | MIT | Catches all dev email | — |

**Reference only, not reused:** open-source NTA-style mock-test clones on GitHub show the palette and timer UX well, but they are static front-end demos. Use them for UX comparison only.

## Module PRDs

Each module below lists the spec requirements it covers, the blocks it assembles, the code we write, and the acceptance tests (AT) from the spec that close it. FR and AT numbers refer to the SRS v1.0.

| # | Module | Covers | Assembled from | We build | Done when |
| --- | --- | --- | --- | --- | --- |
| M1 | Tenancy, identity, audit | FR-001–007 | Better Auth (organization = institute), CASL, Drizzle RLS | Institute approval and suspension, role matrix from §4, insert-only audit table fed by DB triggers | AT-15–18 pass on every endpoint |
| M2 | People and batches | FR-003 | react-spreadsheet-import or Papa Parse, BullMQ | Enrolment rules, row-level CSV error report | 1,000-row CSV imports with per-row errors |
| M3 | Syllabus and material | FR-060–063 | shadcn tree layout, Uppy, SeaweedFS | Exam → Subject → Unit → Chapter → Topic tree, templates copied per institute, `batch_topic_progress` | Batch A progress never changes Batch B |
| M4 | Question bank | FR-016, 018, 061 | Tiptap + maths, MathLive, KaTeX, `pg_trgm`/`pgvector` | Question schema per type, versions, topic tags, "possible duplicate of Q12" warnings | Search by exam, subject, topic, difficulty |
| M5 | Paper ingestion and review | FR-010–015, 017, 019–022 | Docling, pdfplumber, pypdfium2, ClamAV, Uppy, SeaweedFS | Rule-based segmenter, EXTRACTED / AI-INFERRED / MANUAL labels, confidence flags, side-by-side editor, answer-key mapping, approval gate | AT-01, 02, 21; ≥ 90% of 10 clean pilot DOCX papers parsed without edits |
| M6 | Test setup and CBT engine | FR-030–038 | Dexie, Page Visibility API, Zustand, Valkey, BullMQ | Test wizard, exam presets, server timer, 5-state palette, autosave with sequence numbers, strict mode, incident log, receipt | AT-03–11 |
| M7 | Evaluation, ranks, reports | FR-050–056 | BullMQ, Gotenberg, KaTeX, Recharts | Marking engine (negative, partial, numeric tolerance), versioned results, rank and percentile jobs, report template | AT-12–14; result in under 60 s for 500 attempts |
| M8 | Notifications | FR-080–082 | React Email, BullMQ, email API; Novu in Phase 2 | Event bus, dedupe key, retries with back-off, preferences | AT-25 |
| M9 | Dashboards and analytics | FR-090, 093 | Postgres materialized views, Recharts, TanStack Table | Metric SQL, reteach list, declining-student rule, rule-based recommendations with reasons | Every result shows weak topics and a next step |
| M10 | Attendance and parents (Phase 2) | FR-070–071, 091–092 | shadcn forms, CASL link conditions | Session records, attendance % formula, one-time link codes, parent dashboard | AT-19, 20 |
| M11 | Proctoring and lockdown (Phases 3–4) | FR-039–040 | MediaPipe Face Detector, Safe Exam Browser | Consent screen, snapshot schedule, incident review and appeal, SEB config-key check | AT-24 |

**M5 detail: how a paper becomes questions**

1. The upload goes to storage as an untouched original, then ClamAV scans it.
2. The FastAPI service runs Docling. For DOCX, that gives headings, numbered lists, tables, images and equations as LaTeX. For text PDFs, it adds pdfplumber positions.
3. Our segmenter turns the Docling document into question drafts. It uses deterministic rules first: numbering patterns, option markers like (A) and a), section headings, and "Assertion"/"Reason" labels. An optional AI pass only handles ambiguous cases, and its output is labelled AI-INFERRED.
4. Every draft carries a confidence score, and a source page region so the editor can show it next to the original.
5. The teacher fixes the flags and maps the answer key. A preview renders in the exact exam layout. Approval freezes that version, and a paper with an open flag or a missing key cannot be approved (422).

**M6 detail: exam presets.** The pilot pattern is not decided, so the engine is configured by data, not code. Each preset sets the sections, palette, marking, navigation, numeric-answer rules and strict-mode level.

| Preset | Navigation | Palette | Marking example | Notes |
| --- | --- | --- | --- | --- |
| NTA-style (default) | Free within sections, section tabs | 5 states | +4 / −1, numerical answers | Matches what JEE/CUET students see |
| Private-university MCQ | Free or one-way, set per test | 5 states | +1 / 0 or +3 / −1 | Covers most BITSAT, VITEEE, MET-style mocks |
| Practice | Free, explanations after each question | Simple | No negatives | Strict mode off; mobile allowed |

**Not reused for the CBT engine:** open-source exam platforms such as Moodle Quiz or TCExam are GPL/AGPL, and they assume their own LMS. They are reference only.

## Design system and UI kit

The two Dribbble references map onto stock shadcn/ui parts, so the shell is configuration and theming, not new components. The live exam screen is the one exception: it gets its own full-screen layout with no sidebar.

| Reference element | shadcn/ui part | Our setting |
| --- | --- | --- |
| Dark navy sidebar, light content | `Sidebar` + `SidebarInset` | Sidebar theme tokens set to navy; content stays light |
| One primary action on top | `SidebarHeader` with a button | Role-specific: "Upload paper" (teacher), "Add students" (admin), "Next test" (student) |
| Labelled groups, nested items | `SidebarGroup`, `SidebarGroupLabel`, `SidebarMenuSub` + `Collapsible` | Groups per role, listed below |
| Count badges | `SidebarMenuBadge` | Flags to review, pending approvals, unread notifications |
| Profile and usage card at the bottom | `SidebarFooter` | Institute name, storage or plan usage, user menu |
| Collapse to icons | `collapsible="icon"` | Remembered per user |
| Builder form + right meta panel, Import/Publish top right | Page template: main column + 320 px side panel | Used for the question editor, test wizard and conversion editor |

**Sidebar groups by role**

- **Institute admin:** Overview · Academics (Batches, Syllabus, Question bank) · Tests (Papers, Tests, Results, Flags) · People (Teachers, Students, Parents) · Reports · Settings.
- **Teacher:** Today · My batches · Papers (Upload, Needs review, Approved) · Tests · Question bank · Attendance · Insights.
- **Student:** Home · Tests (Upcoming, Results) · Practice · Syllabus · Weak topics.
- **Parent:** child switcher at the top · Results · Attendance · Syllabus · Feedback.

**Starting tokens** (approximated from the screenshots, to be confirmed with the designer):

- Neutral palette with one accent, as in the reference.
- 8 px spacing steps, 8 px corner radius.
- One sans-serif family (Inter or Geist).
- Status colours used only for meaning: answered, not answered, marked for review, flagged.

**Live CBT screen (not in the references):**

- **Top bar:** test name, section tabs, candidate name, countdown timer driven by the server.
- **Centre:** the question and its options.
- **Right panel:** the 5-state palette.
- **Bottom bar:** Previous, Save & Next, Mark for Review & Next, Clear Response, Submit.
- **Saved indicator:** always visible.

Design this screen first, at desktop size, because students compare it to the real exam.

## Licensing and compliance check

No block in the catalogue requires us to publish our own code, as long as the copyleft items below stay separate and unmodified. A lawyer should still confirm this list once, alongside the DPDP Act review the spec already requires.

| Item | License | Risk | How we use it safely |
| --- | --- | --- | --- |
| PyMuPDF | AGPL-3.0 | High: network use counts as distribution | **Excluded.** Use pdfplumber and pypdfium2 instead |
| MinIO Community | AGPL-3.0, maintenance mode | High: no binaries or images, security fixes only | **Excluded.** Use SeaweedFS (Apache-2.0) |
| Redis 8 | RSALv2 / SSPLv1 / AGPLv3 | Medium | **Excluded.** Use Valkey (BSD-3); BullMQ works with any Redis-protocol server from 6.2 |
| Garage (S3) | AGPL-3.0 | Medium | Not chosen |
| ClamAV | GPL-2.0 | Low | Separate daemon over a socket, unmodified |
| k6 | AGPL-3.0 | Low | Dev tool only, never shipped to users |
| Safe Exam Browser | MPL | Low | Students install the official client; we only check its config key |
| Novu | MIT core, commercial `/enterprise` folder | Low | Use community self-hosted features only |
| Coolify | Apache-2.0 | Operational: Jan 2026 CVEs fixed in v4.0.0 | Keep it updated; dashboard behind VPN or IP allow-list |
| Docling AI models | Per-model licenses | Check | Confirm each model's license before production |
| Better Auth NestJS adapter | MIT, community maintained | Maintenance risk | Pin versions; the adapter is thin and can be forked |

Sources for these licensing facts are in the Sources list at the end.

## Repo, tooling and dev workflow

Use one Turborepo monorepo, so the web app, API and worker share types, Zod schemas and CASL rules, and one pull request can change the API and UI together.

```
apps/
  web/          Next.js — all four role apps + landing + CBT screen
  api/          NestJS — REST /api/v1, one Nest module per M1–M11
  worker/       BullMQ processors — auto-submit sweep, evaluate, rank, import, notify
services/
  docparse/     FastAPI + Docling + pdfplumber — paper → question drafts
packages/
  db/           Drizzle schema, RLS policies, migrations, seed + load-test data
  contracts/    Zod schemas + generated OpenAPI client
  abilities/    CASL rules shared by api and web
  ui/           shadcn components, theme tokens, exam palette
  config/       ESLint, TypeScript, Tailwind presets
```

**Local setup in one command:** `docker compose up` starts Postgres, Valkey, SeaweedFS, Gotenberg, ClamAV, Mailpit and docparse. Then `pnpm dev` runs the web app, API and worker.

**Workflow**

1. Trunk-based development: short-lived branches and small pull requests, each with one reviewer.
2. CI on GitHub Actions runs, in order: lint, typecheck, unit tests, **tenant-isolation tests** (every endpoint called as Institute B against Institute A's data), migration check, Playwright end-to-end tests, then a container build.
3. Coolify deploys `main` to staging automatically. Production needs a manual approval, and deploys are blocked during scheduled exam windows.
4. Renovate keeps dependencies current monthly. The license check runs in CI and fails on any new AGPL or GPL dependency inside `apps/` or `packages/`.
5. Definition of done: reviewed, tests green, acceptance test for the FR passing, demoed to the founder.

**Build order** (the spec's order, with blocks slotted in):

1. Monorepo, compose stack, CI, Coolify staging.
2. M1 tenancy, auth, RBAC, audit, plus the isolation test harness.
3. M4 question model and editor (the manual safety net).
4. M6 CBT engine and server timer.
5. M7 evaluation and results.
6. M5 docparse service and conversion editor.
7. Ranks, M9 dashboards, M3 syllabus, M8 notifications.
8. Hardening: k6 load test at 750 users, security test, restore drill, pilot.

**Pilot server sizing** (proposed, to be checked by the load test):

- **App VPS:** 4 vCPU / 8 GB, running web, API and worker.
- **Database VPS:** 4 vCPU / 8 GB, running Postgres and Valkey.
- **Parsing and PDF VPS:** 4 vCPU / 8 GB, running docparse, Gotenberg and ClamAV.
- **Storage:** SeaweedFS on the database VPS or its own disk.
- **Backups:** off-site object storage in a second region.

Indian regions exist at Vultr, Akamai/Linode, OVHcloud and Contabo in Mumbai, and at DigitalOcean in Bengaluru. Hetzner has no Indian data centre ([source](https://www.techplained.com/cheapest-vps-india)).

## Roadmap and effort with blocks

With 2 developers at about 20 working days a month each, an MVP of 135–195 dev-days is roughly 3.5–5 months, against 4.5–6.5 months on the spec's own figures. These are rough guesses, not measurements, with the spec's ±40% uncertainty.

&#91;embedded content: phased roadmap · 4 phases, 3 gates\]

| Phase | Spec estimate (dev-days) | With blocks (dev-days, rough) | Where the time is saved |
| --- | --- | --- | --- |
| 1 · MVP | 180–260 | 135–195 | Login, institutes and roles (Better Auth, CASL); DOCX structure and equations (Docling); maths editor (Tiptap, MathLive); UI shell (shadcn); PDF reports (Gotenberg) |
| 2 · Institute management | 120–180 | 90–135 | Inbox, preferences, digests and SMS (Novu); exports reuse Gotenberg |
| 3 · Advanced exams | 120–200 | 90–150 | OCR and formula recognition (PaddleOCR); in-browser face detection (MediaPipe) |
| 4 · Expansion | Re-estimate | Re-estimate | Lockdown via Safe Exam Browser instead of building a desktop app per OS |

The custom core does not shrink: the segmenter, CBT engine, evaluation and dashboards' logic are still most of the MVP effort. Re-estimate after the design review and the first 10 pilot papers are parsed.

## Open questions for the founder

The first two block the pilot; the rest can be settled during Phase 1 design.

- [ ] **Pilot exam pattern:** which exam, which sections, what marking? This picks the default CBT preset.
- [ ] **Team:** confirm 2 TypeScript developers, or say who is building it.
- [ ] **VPS provider and city:** Mumbai (Vultr, Akamai, OVHcloud, Contabo) or Bengaluru (DigitalOcean)?
- [ ] **Email provider:** which transactional email API? Also, are SMS (DLT templates) or WhatsApp needed in Phase 2?
- [ ] **AI assist in segmentation:** allowed in the MVP, and with what monthly budget cap?
- [ ] **Parsing speed:** is 1–3 minutes per 100-question paper on a CPU-only VPS acceptable? That figure is unmeasured; test it on the 10 pilot papers.
- [ ] **Flag review:** who may dismiss a strict-mode flag and grant a re-attempt? The spec recommends the Institute Admin only.
- [ ] **Legal review:** DPDP Act roles, parental consent for under-18 students, retention periods, and this license list.

## Sources

Pages opened while choosing blocks (as of 23 Nov 2026):

- [shadcn/ui Sidebar docs](https://ui.shadcn.com/docs/components/sidebar)
- [Better Auth NestJS integration](https://better-auth.com/docs/integrations/nestjs)
- [CASL repository](https://github.com/stalniy/casl)
- [Drizzle ORM row-level security](https://orm.drizzle.team/docs/rls)
- [Valkey vs Redis licensing (Redis blog)](https://redis.io/blog/what-is-valkey/)
- [BullMQ on Redis-compatible servers](https://github.com/taskforcesh/bullmq/discussions/2484)
- [Docling DOCX backend (OMML to LaTeX)](https://mintlify.com/docling-project/docling/api/backends/docx)
- [Docling technical report (MIT)](https://arxiv.org/html/2501.17887v1)
- [PyMuPDF licensing](https://pymupdf.readthedocs.io/en/latest/about.html)
- [pdfplumber and PyMuPDF licenses compared](https://www.file2markdown.ai/blog/pymupdf-alternatives)
- [PaddleOCR 3.0 technical report](https://arxiv.org/html/2507.05595v1)
- [Tiptap Mathematics extension](https://tiptap.dev/docs/editor/extensions/nodes/mathematics)
- [Tiptap DOCX import skips equations](https://tiptap.dev/docs/conversion/content-types/structures-and-media/math-equations)
- [MathLive on npm](https://www.npmjs.com/package/mathlive)
- [react-spreadsheet-import](https://www.jsdelivr.com/package/npm/react-spreadsheet-import)
- [MinIO moving away from open source](https://itsfoss.com/news/minio-moves-away-from-open-source/)
- [MinIO alternatives and their licenses (InfoQ)](https://www.infoq.com/news/2025/12/minio-s3-api-alternatives)
- [Gotenberg (MIT)](https://pkg.go.dev/github.com/gotenberg/gotenberg/v8)
- [Novu: what it is and self-hosting](https://docs.novu.co/platform/what-is-novu)
- [Novu open-core licensing](https://github.com/thangved/novu)
- [MediaPipe Face Detector for web](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js)
- [Safe Exam Browser FAQ (MPL)](https://www.safeexambrowser.org/alliance/faq.html)
- [Coolify vs Dokploy licensing](https://contabo.com/blog/blog-coolify-vs-dokploy-comparison)
- [GlitchTip self-hosting (MIT)](https://railway.com/deploy/glitchtip-railway)
- [VPS options with Indian data centres](https://www.techplained.com/cheapest-vps-india)

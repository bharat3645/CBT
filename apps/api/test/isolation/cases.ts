import type { Fixture } from "../harness";

/**
 * Tenant-isolation cases. Each case is executed as an ADMIN OF INSTITUTE B against INSTITUTE A's data.
 *  - kind "id":   the call targets one of A's records -> must be 400/403/404 (never 2xx, never A's data)
 *  - kind "list": the call lists records -> must be 2xx/403 and the body must contain none of A's identifiers
 * Every route registered in the API must either appear here (key = "METHOD /path/:template") or be in
 * NOT_TENANT_DATA in isolation.test.ts. A new endpoint without a case FAILS the coverage test.
 *
 * Modules: append your cases to CASES (one entry per endpoint). `a` is institute A's fixture (ids you can target).
 */
export interface IsolationCase {
  /** route template exactly as registered, e.g. "GET /api/v1/batches/:id" */
  key: string;
  kind: "id" | "list";
  path: (a: Fixture) => string;
  body?: (a: Fixture) => unknown;
}

const U = (a: Fixture) => a.student.userId;
const uuid0 = "00000000-0000-4000-8000-000000000000";

export const CASES: IsolationCase[] = [
  { key: "GET /api/v1/me", kind: "list", path: () => "/api/v1/me" },
  { key: "GET /api/v1/institute", kind: "list", path: () => "/api/v1/institute" },
  { key: "PATCH /api/v1/institute", kind: "list", path: () => "/api/v1/institute", body: () => ({ name: "hijacked" }) },

  { key: "GET /api/v1/audit-logs", kind: "list", path: (a) => `/api/v1/audit-logs?instituteId=${a.institute.id}` },

  { key: "GET /api/v1/users", kind: "list", path: () => "/api/v1/users?limit=200" },
  { key: "POST /api/v1/users", kind: "id", path: () => "/api/v1/users", body: (a) => ({ role: "student", name: "X", email: "x@b.test", batchIds: [a.batchId] }) },
  { key: "GET /api/v1/users/:id", kind: "id", path: (a) => `/api/v1/users/${U(a)}` },
  { key: "PATCH /api/v1/users/:id", kind: "id", path: (a) => `/api/v1/users/${U(a)}`, body: () => ({ rollNo: "HACK" }) },
  { key: "DELETE /api/v1/users/:id", kind: "id", path: (a) => `/api/v1/users/${U(a)}` },

  { key: "POST /api/v1/guardian-links", kind: "id", path: () => "/api/v1/guardian-links", body: (a) => ({ guardianId: a.parent.profileId, studentId: a.student.profileId }) },
  { key: "DELETE /api/v1/guardian-links/:guardianId/:studentId", kind: "id", path: (a) => `/api/v1/guardian-links/${a.parent.profileId}/${a.student.profileId}` },

  { key: "GET /api/v1/batches", kind: "list", path: () => "/api/v1/batches" },
  { key: "POST /api/v1/batches", kind: "list", path: () => "/api/v1/batches", body: () => ({ name: "b-own", year: 2026 }) },
  { key: "GET /api/v1/batches/:id", kind: "id", path: (a) => `/api/v1/batches/${a.batchId}` },
  { key: "PATCH /api/v1/batches/:id", kind: "id", path: (a) => `/api/v1/batches/${a.batchId}`, body: () => ({ name: "hijacked" }) },
  { key: "DELETE /api/v1/batches/:id", kind: "id", path: (a) => `/api/v1/batches/${a.otherBatchId}` },
  { key: "POST /api/v1/batches/:id/students", kind: "id", path: (a) => `/api/v1/batches/${a.batchId}/students`, body: (a) => ({ studentIds: [a.student.profileId] }) },
  { key: "DELETE /api/v1/batches/:id/students/:studentId", kind: "id", path: (a) => `/api/v1/batches/${a.batchId}/students/${a.student.profileId}` },
  { key: "POST /api/v1/batches/:id/teachers", kind: "id", path: (a) => `/api/v1/batches/${a.batchId}/teachers`, body: (a) => ({ teacherIds: [a.teacher.profileId] }) },
  { key: "DELETE /api/v1/batches/:id/teachers/:teacherId", kind: "id", path: (a) => `/api/v1/batches/${a.batchId}/teachers/${a.teacher.profileId}` },

  { key: "GET /api/v1/imports/users/template", kind: "list", path: () => "/api/v1/imports/users/template" },
  { key: "POST /api/v1/imports/users", kind: "list", path: () => "/api/v1/imports/users", body: (a) => ({ csv: `name,email,batches\nZed,zed@b.test,${a.institute.slug}-batch-1\n` }) },
  { key: "GET /api/v1/imports/:id", kind: "id", path: () => `/api/v1/imports/${uuid0}` },
  { key: "GET /api/v1/imports/:id/errors.csv", kind: "id", path: () => `/api/v1/imports/${uuid0}/errors.csv` },
  // --- feature modules (M3–M9) ---
  { key: "GET /api/v1/exam-presets", kind: "list", path: () => `/api/v1/exam-presets` },
  { key: "GET /api/v1/tests", kind: "list", path: () => `/api/v1/tests` },
  { key: "GET /api/v1/tests/upcoming", kind: "list", path: () => `/api/v1/tests/upcoming` },
  { key: "POST /api/v1/tests", kind: "id", path: () => `/api/v1/tests`, body: () => ({}) },
  { key: "POST /api/v1/tests/:id/publish", kind: "id", path: () => `/api/v1/tests/${uuid0}/publish` },
  { key: "POST /api/v1/tests/:id/attempts", kind: "id", path: () => `/api/v1/tests/${uuid0}/attempts` },
  { key: "GET /api/v1/attempts/:id/questions", kind: "id", path: () => `/api/v1/attempts/${uuid0}/questions` },
  { key: "POST /api/v1/attempts/:id/answers", kind: "id", path: () => `/api/v1/attempts/${uuid0}/answers`, body: () => ({}) },
  { key: "POST /api/v1/attempts/:id/incidents", kind: "id", path: () => `/api/v1/attempts/${uuid0}/incidents`, body: () => ({}) },
  { key: "POST /api/v1/attempts/:id/submit", kind: "id", path: () => `/api/v1/attempts/${uuid0}/submit` },
  { key: "GET /api/v1/questions", kind: "list", path: () => `/api/v1/questions` },
  { key: "POST /api/v1/questions/duplicates", kind: "list", path: () => `/api/v1/questions/duplicates`, body: () => ({ stemText: 'x' }) },
  { key: "POST /api/v1/questions", kind: "id", path: () => `/api/v1/questions`, body: () => ({}) },
  { key: "GET /api/v1/questions/:id", kind: "id", path: () => `/api/v1/questions/${uuid0}` },
  { key: "GET /api/v1/questions/:id/versions", kind: "list", path: () => `/api/v1/questions/${uuid0}/versions` },
  { key: "GET /api/v1/questions/:id/versions/:version", kind: "id", path: () => `/api/v1/questions/${uuid0}/versions/1` },
  { key: "PUT /api/v1/questions/:id", kind: "id", path: () => `/api/v1/questions/${uuid0}`, body: () => ({}) },
  { key: "GET /api/v1/syllabus/tree", kind: "list", path: () => `/api/v1/syllabus/tree` },
  { key: "GET /api/v1/syllabus/templates", kind: "list", path: () => `/api/v1/syllabus/templates` },
  { key: "POST /api/v1/syllabus/templates/copy", kind: "id", path: () => `/api/v1/syllabus/templates/copy`, body: () => ({}) },
  { key: "POST /api/v1/syllabus/nodes", kind: "id", path: () => `/api/v1/syllabus/nodes`, body: () => ({}) },
  { key: "PATCH /api/v1/syllabus/nodes/:id", kind: "id", path: () => `/api/v1/syllabus/nodes/${uuid0}`, body: () => ({}) },
  { key: "DELETE /api/v1/syllabus/nodes/:id", kind: "id", path: () => `/api/v1/syllabus/nodes/${uuid0}` },
  { key: "POST /api/v1/syllabus/materials", kind: "id", path: () => `/api/v1/syllabus/materials`, body: () => ({}) },
  { key: "GET /api/v1/syllabus/topics/:topicId/materials", kind: "list", path: () => `/api/v1/syllabus/topics/${uuid0}/materials` },
  { key: "GET /api/v1/syllabus/batches/:batchId/progress", kind: "list", path: () => `/api/v1/syllabus/batches/${uuid0}/progress` },
  { key: "PUT /api/v1/syllabus/batches/:batchId/progress/:topicId", kind: "id", path: () => `/api/v1/syllabus/batches/${uuid0}/progress/${uuid0}`, body: () => ({}) },
  { key: "POST /api/v1/ingestion/papers", kind: "id", path: () => `/api/v1/ingestion/papers`, body: () => ({}) },
  { key: "GET /api/v1/ingestion/papers", kind: "list", path: () => `/api/v1/ingestion/papers` },
  { key: "GET /api/v1/ingestion/papers/:id", kind: "id", path: () => `/api/v1/ingestion/papers/${uuid0}` },
  { key: "PATCH /api/v1/ingestion/papers/:id/drafts/:draftId", kind: "id", path: () => `/api/v1/ingestion/papers/${uuid0}/drafts/${uuid0}`, body: () => ({}) },
  { key: "PUT /api/v1/ingestion/papers/:id/answer-key", kind: "id", path: () => `/api/v1/ingestion/papers/${uuid0}/answer-key`, body: () => ({}) },
  { key: "POST /api/v1/ingestion/papers/:id/approve", kind: "id", path: () => `/api/v1/ingestion/papers/${uuid0}/approve` },
  { key: "GET /api/v1/results/mine", kind: "list", path: () => `/api/v1/results/mine` },
  { key: "GET /api/v1/results/:attemptId", kind: "id", path: () => `/api/v1/results/${uuid0}` },
  { key: "GET /api/v1/results/:attemptId/report.pdf", kind: "id", path: () => `/api/v1/results/${uuid0}/report.pdf` },
  { key: "GET /api/v1/tests/:testId/leaderboard", kind: "list", path: () => `/api/v1/tests/${uuid0}/leaderboard` },
  { key: "PUT /api/v1/tests/:testId/result-settings", kind: "id", path: () => `/api/v1/tests/${uuid0}/result-settings`, body: () => ({}) },
  { key: "POST /api/v1/tests/:testId/results/release", kind: "list", path: () => `/api/v1/tests/${uuid0}/results/release` },
  { key: "POST /api/v1/tests/:testId/answer-key/corrections", kind: "id", path: () => `/api/v1/tests/${uuid0}/answer-key/corrections`, body: () => ({}) },
  { key: "GET /api/v1/notifications", kind: "list", path: () => `/api/v1/notifications` },
  { key: "GET /api/v1/notifications/unread-count", kind: "list", path: () => `/api/v1/notifications/unread-count` },
  { key: "POST /api/v1/notifications/read-all", kind: "list", path: () => `/api/v1/notifications/read-all` },
  { key: "POST /api/v1/notifications/:id/read", kind: "id", path: () => `/api/v1/notifications/${uuid0}/read` },
  { key: "GET /api/v1/notifications/preferences", kind: "list", path: () => `/api/v1/notifications/preferences` },
  { key: "PUT /api/v1/notifications/preferences", kind: "list", path: () => `/api/v1/notifications/preferences`, body: () => ({}) },
  { key: "GET /api/v1/analytics/batch", kind: "list", path: () => `/api/v1/analytics/batch` },
  { key: "GET /api/v1/analytics/batch.csv", kind: "list", path: () => `/api/v1/analytics/batch.csv` },
  { key: "GET /api/v1/analytics/students/:studentId", kind: "list", path: () => `/api/v1/analytics/students/${uuid0}` },
  { key: "GET /api/v1/analytics/me", kind: "list", path: () => `/api/v1/analytics/me` },
  // --- dashboard module: aggregates are computed under the caller's RLS context ---
  { key: "GET /api/v1/dashboard", kind: "list", path: (a) => `/api/v1/dashboard?childId=${a.student.profileId}` },
  { key: "GET /api/v1/children", kind: "list", path: () => `/api/v1/children` },
  { key: "GET /api/v1/guardian-links", kind: "list", path: (a) => `/api/v1/guardian-links?guardianId=${a.parent.profileId}&studentId=${a.student.profileId}` },
];

/** Routes that are not tenant data (public, or platform-scope). Super-admin routes are asserted forbidden for tenants separately. */
export const NOT_TENANT_DATA = new Set<string>([
  "GET /api/v1/health",
  "POST /api/v1/institutes", // public registration
  "GET /api/v1/institutes",
  "GET /api/v1/institutes/:id",
  "POST /api/v1/institutes/:id/approve",
  "POST /api/v1/institutes/:id/suspend",
  "POST /api/v1/institutes/:id/reactivate",
  "POST /api/v1/institutes/:id/deactivate",
]);

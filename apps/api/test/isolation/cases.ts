import type { Role } from "../harness";
import type { AFix } from "./fixtures";

/**
 * Tenant-isolation cases. Every id in a path or body is a REAL row of Institute A (see fixtures.ts), and the
 * call is made as a user of Institute B (default: its admin; `as` picks another B role).
 *  - kind "id":   the call targets one of A's records -> must be 403/404 (or one of `ok`, never 2xx), body leaks nothing
 *  - kind "list": the call may succeed in B's own scope -> must be 2xx/403/404 and the body contains none of A's data
 * Additionally, `deny` names a user role of Institute A that must be refused (403/404) on the same call,
 * and GET cases get a positive control (A's own admin/`as` role sees 2xx) so a 404 for B cannot just mean "bad id".
 * Every route registered in the API must appear here (key = "METHOD /path/:template") or be in NOT_TENANT_DATA.
 * A new endpoint without a case FAILS the coverage test. `a` is Institute A's fixture with real row ids.
 */
export interface IsolationCase {
  /** route template exactly as registered, e.g. "GET /api/v1/batches/:id" */
  key: string;
  kind: "id" | "list";
  path: (a: AFix) => string;
  body?: (a: AFix) => unknown;
  /** role of the Institute B caller (default institute_admin) */
  as?: Role;
  /** role of an Institute A user that must be refused on this exact call */
  deny?: Role;
  /** extra statuses accepted for B on kind "id" (create-style routes reject bad references with 400/422) */
  ok?: number[];
  /** skip the "A's own user gets 2xx" positive control for GETs */
  noPositive?: boolean;
}

const U = (a: AFix) => a.student.userId;
const iso = () => new Date().toISOString();
const doc = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
const qPayload = (a: AFix) => ({
  type: "mcq_single", stem: doc("b stem"), options: [{ id: "A", content: doc("a") }, { id: "B", content: doc("b") }], correct: ["A"],
  topicIds: [a.topicId],
});

export const CASES: IsolationCase[] = [
  { key: "GET /api/v1/me", kind: "list", path: () => "/api/v1/me" },
  { key: "GET /api/v1/institute", kind: "list", path: () => "/api/v1/institute" },
  { key: "PATCH /api/v1/institute", kind: "list", path: () => "/api/v1/institute", body: () => ({ name: "hijacked" }), deny: "student" },

  { key: "GET /api/v1/audit-logs", kind: "list", path: (a) => `/api/v1/audit-logs?instituteId=${a.institute.id}`, deny: "student" },

  { key: "GET /api/v1/users", kind: "list", path: () => "/api/v1/users?limit=200", deny: "student" },
  { key: "POST /api/v1/users", kind: "id", path: () => "/api/v1/users", body: (a) => ({ role: "student", name: "X", email: "x@b.test", batchIds: [a.batchId] }), ok: [400, 422], deny: "student" },
  { key: "GET /api/v1/users/:id", kind: "id", path: (a) => `/api/v1/users/${U(a)}`, deny: "parent" },
  { key: "PATCH /api/v1/users/:id", kind: "id", path: (a) => `/api/v1/users/${U(a)}`, body: () => ({ rollNo: "HACK" }), deny: "student" },
  { key: "DELETE /api/v1/users/:id", kind: "id", path: (a) => `/api/v1/users/${U(a)}`, deny: "student" },

  { key: "POST /api/v1/guardian-links", kind: "id", path: () => "/api/v1/guardian-links", body: (a) => ({ guardianId: a.parent.profileId, studentId: a.student.profileId }), ok: [400, 422], deny: "student" },
  { key: "DELETE /api/v1/guardian-links/:guardianId/:studentId", kind: "id", path: (a) => `/api/v1/guardian-links/${a.parent.profileId}/${a.student.profileId}`, deny: "student" },

  { key: "GET /api/v1/batches", kind: "list", path: () => "/api/v1/batches" },
  { key: "POST /api/v1/batches", kind: "list", path: () => "/api/v1/batches", body: () => ({ name: "b-own", year: 2026 }), deny: "student" },
  { key: "GET /api/v1/batches/:id", kind: "id", path: (a) => `/api/v1/batches/${a.batchId}`, deny: "parent" },
  { key: "PATCH /api/v1/batches/:id", kind: "id", path: (a) => `/api/v1/batches/${a.batchId}`, body: () => ({ name: "hijacked" }), deny: "student" },
  { key: "DELETE /api/v1/batches/:id", kind: "id", path: (a) => `/api/v1/batches/${a.otherBatchId}`, deny: "student" },
  { key: "POST /api/v1/batches/:id/students", kind: "id", path: (a) => `/api/v1/batches/${a.batchId}/students`, body: (a) => ({ studentIds: [a.student.profileId] }), deny: "student" },
  { key: "DELETE /api/v1/batches/:id/students/:studentId", kind: "id", path: (a) => `/api/v1/batches/${a.batchId}/students/${a.student.profileId}`, deny: "student" },
  { key: "POST /api/v1/batches/:id/teachers", kind: "id", path: (a) => `/api/v1/batches/${a.batchId}/teachers`, body: (a) => ({ teacherIds: [a.teacher.profileId] }), deny: "student" },
  { key: "DELETE /api/v1/batches/:id/teachers/:teacherId", kind: "id", path: (a) => `/api/v1/batches/${a.batchId}/teachers/${a.teacher.profileId}`, deny: "student" },

  { key: "GET /api/v1/imports/users/template", kind: "list", path: () => "/api/v1/imports/users/template", deny: "student" },
  { key: "POST /api/v1/imports/users", kind: "list", path: () => "/api/v1/imports/users", body: (a) => ({ csv: `name,email,batches\nZed,zed@b.test,${a.institute.slug}-batch-1\n` }), deny: "student" },
  { key: "GET /api/v1/imports/:id", kind: "id", path: (a) => `/api/v1/imports/${a.importId}`, deny: "student" },
  { key: "GET /api/v1/imports/:id/errors.csv", kind: "id", path: (a) => `/api/v1/imports/${a.importId}/errors.csv`, deny: "student" },

  // --- exams ---
  { key: "GET /api/v1/exam-presets", kind: "list", path: () => `/api/v1/exam-presets` },
  { key: "GET /api/v1/tests", kind: "list", path: () => `/api/v1/tests`, deny: "student" },
  { key: "GET /api/v1/tests/upcoming", kind: "list", path: () => `/api/v1/tests/upcoming`, as: "student" },
  {
    key: "POST /api/v1/tests", kind: "id", path: () => `/api/v1/tests`, ok: [400, 422], deny: "student",
    body: (a) => ({
      title: "evil", paperId: a.paperId, batchIds: [a.batchId], presetKey: "practice", durationMinutes: 30,
      sections: [{ name: "S", questionIds: [a.questionId] }],
      windowStart: new Date(Date.now() + 3_600_000).toISOString(), windowEnd: new Date(Date.now() + 7_200_000).toISOString(),
    }),
  },
  { key: "PATCH /api/v1/tests/:id", kind: "id", path: (a) => `/api/v1/tests/${a.testId}`, body: () => ({ title: "hijacked" }), deny: "student" },
  { key: "POST /api/v1/tests/:id/cancel", kind: "id", path: (a) => `/api/v1/tests/${a.draftTestId}/cancel`, deny: "student" },
  { key: "POST /api/v1/tests/:id/publish", kind: "id", path: (a) => `/api/v1/tests/${a.draftTestId}/publish`, deny: "student" },
  { key: "POST /api/v1/tests/:id/attempts", kind: "id", path: (a) => `/api/v1/tests/${a.testId}/attempts`, as: "student", deny: "parent" },
  { key: "GET /api/v1/attempts/:id/questions", kind: "id", path: (a) => `/api/v1/attempts/${a.attemptId}/questions`, as: "student", deny: "teacher", noPositive: true },
  {
    key: "POST /api/v1/attempts/:id/answers", kind: "id", path: (a) => `/api/v1/attempts/${a.attemptId}/answers`, as: "student", deny: "teacher",
    body: (a) => ({ items: [{ questionId: a.questionId, seq: 9, status: "answered", value: { selected: ["B"], numeric: null } }] }),
  },
  { key: "POST /api/v1/attempts/:id/incidents", kind: "id", path: (a) => `/api/v1/attempts/${a.attemptId}/incidents`, as: "student", deny: "teacher", body: () => ({ type: "tab_hidden", occurredAt: iso() }) },
  { key: "POST /api/v1/attempts/:id/submit", kind: "id", path: (a) => `/api/v1/attempts/${a.attemptId}/submit`, as: "student", deny: "teacher" },

  // --- question bank ---
  { key: "GET /api/v1/questions", kind: "list", path: () => `/api/v1/questions`, deny: "student" },
  { key: "POST /api/v1/questions/duplicates", kind: "list", path: () => `/api/v1/questions/duplicates`, body: () => ({ stemText: "ALPHA-SECRET-STEM" }), deny: "student" },
  { key: "POST /api/v1/questions", kind: "id", path: () => `/api/v1/questions`, body: (a) => ({ payload: qPayload(a) }), ok: [400, 422], deny: "student" },
  { key: "GET /api/v1/questions/:id", kind: "id", path: (a) => `/api/v1/questions/${a.questionId}`, deny: "student" },
  { key: "GET /api/v1/questions/:id/versions", kind: "id", path: (a) => `/api/v1/questions/${a.questionId}/versions`, deny: "student" },
  { key: "GET /api/v1/questions/:id/versions/:version", kind: "id", path: (a) => `/api/v1/questions/${a.questionId}/versions/1`, deny: "student" },
  { key: "PUT /api/v1/questions/:id", kind: "id", path: (a) => `/api/v1/questions/${a.questionId}`, body: (a) => ({ payload: { ...qPayload(a), topicIds: [] }, changeNote: "hijack" }), deny: "student" },

  // --- syllabus ---
  { key: "GET /api/v1/syllabus/tree", kind: "list", path: () => `/api/v1/syllabus/tree` },
  { key: "GET /api/v1/syllabus/templates", kind: "list", path: () => `/api/v1/syllabus/templates` },
  { key: "POST /api/v1/syllabus/templates/copy", kind: "id", path: () => `/api/v1/syllabus/templates/copy`, body: (a) => ({ templateRootId: a.rootNodeId }), ok: [400, 422], deny: "student" },
  { key: "POST /api/v1/syllabus/nodes", kind: "id", path: () => `/api/v1/syllabus/nodes`, body: (a) => ({ parentId: a.rootNodeId, level: "subject", name: "evil" }), ok: [400, 422], deny: "student" },
  { key: "PATCH /api/v1/syllabus/nodes/:id", kind: "id", path: (a) => `/api/v1/syllabus/nodes/${a.topicId}`, body: () => ({ name: "hijacked" }), deny: "student" },
  { key: "DELETE /api/v1/syllabus/nodes/:id", kind: "id", path: (a) => `/api/v1/syllabus/nodes/${a.topicId}`, deny: "student" },
  { key: "POST /api/v1/syllabus/materials", kind: "id", path: () => `/api/v1/syllabus/materials`, body: (a) => ({ topicId: a.topicId, title: "evil", storageKey: "b/evil.pdf", mimeType: "application/pdf", sizeBytes: 1 }), ok: [400, 422], deny: "student" },
  { key: "GET /api/v1/syllabus/topics/:topicId/materials", kind: "list", path: (a) => `/api/v1/syllabus/topics/${a.topicId}/materials` },
  { key: "GET /api/v1/syllabus/batches/:batchId/progress", kind: "id", path: (a) => `/api/v1/syllabus/batches/${a.batchId}/progress` },
  { key: "PUT /api/v1/syllabus/batches/:batchId/progress/:topicId", kind: "id", path: (a) => `/api/v1/syllabus/batches/${a.batchId}/progress/${a.topicId}`, body: () => ({ status: "completed" }), deny: "student" },

  // --- paper ingestion ---
  { key: "POST /api/v1/ingestion/papers", kind: "list", path: () => `/api/v1/ingestion/papers`, body: () => ({ title: "b-paper" }), deny: "student" },
  { key: "GET /api/v1/ingestion/papers", kind: "list", path: () => `/api/v1/ingestion/papers`, deny: "student" },
  { key: "GET /api/v1/ingestion/papers/:id", kind: "id", path: (a) => `/api/v1/ingestion/papers/${a.paperId}`, deny: "student" },
  { key: "PATCH /api/v1/ingestion/papers/:id/drafts/:draftId", kind: "id", path: (a) => `/api/v1/ingestion/papers/${a.paperId}/drafts/${a.draftId}`, body: () => ({ stem: "hijacked", answer: "B" }), deny: "student" },
  { key: "PUT /api/v1/ingestion/papers/:id/answer-key", kind: "id", path: (a) => `/api/v1/ingestion/papers/${a.paperId}/answer-key`, body: () => ({ key: { "1": "B" } }), deny: "student" },
  { key: "POST /api/v1/ingestion/papers/:id/approve", kind: "id", path: (a) => `/api/v1/ingestion/papers/${a.paperId}/approve`, deny: "student" },

  // --- results / ranks ---
  { key: "GET /api/v1/results/mine", kind: "list", path: () => `/api/v1/results/mine`, as: "student" },
  { key: "GET /api/v1/results/:attemptId", kind: "id", path: (a) => `/api/v1/results/${a.resultAttemptId}`, as: "student" },
  { key: "GET /api/v1/results/:attemptId/report.pdf", kind: "id", path: (a) => `/api/v1/results/${a.resultAttemptId}/report.pdf`, noPositive: true },
  { key: "GET /api/v1/tests/:testId/leaderboard", kind: "list", path: (a) => `/api/v1/tests/${a.resultTestId}/leaderboard`, deny: "parent" },
  { key: "PUT /api/v1/tests/:testId/result-settings", kind: "id", path: (a) => `/api/v1/tests/${a.resultTestId}/result-settings`, body: () => ({ releaseMode: "manual" }), deny: "student" },
  { key: "POST /api/v1/tests/:testId/results/release", kind: "list", path: (a) => `/api/v1/tests/${a.resultTestId}/results/release`, deny: "student" },
  { key: "POST /api/v1/tests/:testId/answer-key/corrections", kind: "id", path: (a) => `/api/v1/tests/${a.resultTestId}/answer-key/corrections`, body: (a) => ({ corrections: [{ questionId: a.questionId, correct: ["B"] }] }), ok: [400, 422], deny: "student" },

  // --- notifications ---
  { key: "GET /api/v1/notifications", kind: "list", path: () => `/api/v1/notifications` },
  { key: "GET /api/v1/notifications/unread-count", kind: "list", path: () => `/api/v1/notifications/unread-count` },
  { key: "POST /api/v1/notifications/read-all", kind: "list", path: () => `/api/v1/notifications/read-all` },
  { key: "POST /api/v1/notifications/:id/read", kind: "id", path: (a) => `/api/v1/notifications/${a.notificationId}/read`, as: "student", deny: "teacher" },
  { key: "GET /api/v1/notifications/preferences", kind: "list", path: () => `/api/v1/notifications/preferences` },
  { key: "PUT /api/v1/notifications/preferences", kind: "list", path: () => `/api/v1/notifications/preferences`, body: () => ({ preferences: [{ type: "*", channel: "in_app", enabled: false }] }) },

  // --- analytics ---
  { key: "GET /api/v1/analytics/batch", kind: "list", path: (a) => `/api/v1/analytics/batch?batchId=${a.batchId}&testId=${a.resultTestId}`, deny: "student" },
  { key: "GET /api/v1/analytics/batch.csv", kind: "list", path: (a) => `/api/v1/analytics/batch.csv?batchId=${a.batchId}&testId=${a.resultTestId}`, deny: "student" },
  { key: "GET /api/v1/analytics/students/:studentId", kind: "list", path: (a) => `/api/v1/analytics/students/${U(a)}` },
  { key: "GET /api/v1/analytics/me", kind: "list", path: () => `/api/v1/analytics/me` },

  // --- dashboard module ---
  { key: "GET /api/v1/dashboard", kind: "list", path: (a) => `/api/v1/dashboard?childId=${a.student.profileId}` },
  { key: "GET /api/v1/children", kind: "list", path: () => `/api/v1/children` },
  { key: "GET /api/v1/guardian-links", kind: "list", path: (a) => `/api/v1/guardian-links?guardianId=${a.parent.profileId}&studentId=${a.student.profileId}` },
  // --- phase 2: attendance, feedback, practice ---
  { key: "GET /api/v1/attendance/roster", kind: "id", path: (a) => `/api/v1/attendance/roster?batchId=${a.batchId}`, as: "teacher", deny: "student" },
  { key: "PUT /api/v1/attendance", kind: "id", path: () => `/api/v1/attendance`, body: (a) => ({ batchId: a.batchId, date: "2026-01-05", records: [{ studentUserId: a.student.userId, status: "absent" }] }), as: "teacher", deny: "student", ok: [400, 403, 404] },
  { key: "GET /api/v1/attendance/summary", kind: "id", path: (a) => `/api/v1/attendance/summary?studentUserId=${a.student.userId}`, as: "teacher" },
  { key: "GET /api/v1/feedback", kind: "id", path: (a) => `/api/v1/feedback?studentUserId=${a.student.userId}`, as: "teacher" },
  { key: "POST /api/v1/feedback", kind: "id", path: () => `/api/v1/feedback`, body: (a) => ({ studentUserId: a.student.userId, body: "cross-tenant feedback" }), as: "teacher", deny: "student", ok: [400, 403, 404] },
  { key: "GET /api/v1/feedback/students", kind: "list", path: () => `/api/v1/feedback/students`, as: "teacher", deny: "student" },
  { key: "GET /api/v1/practice/topics", kind: "list", path: () => `/api/v1/practice/topics`, as: "student" },
  { key: "GET /api/v1/practice/set", kind: "list", path: () => `/api/v1/practice/set`, as: "student" },
  { key: "POST /api/v1/practice/check", kind: "id", path: () => `/api/v1/practice/check`, body: (a) => ({ questionId: a.questionId, answer: "A" }), as: "student", ok: [400, 403, 404] },
  { key: "GET /api/v1/practice/stats", kind: "list", path: () => `/api/v1/practice/stats`, as: "student" },
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

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { evaluations } from "@cbt/db/schema/results";
import { attempts, tests } from "@cbt/db/schema/exams";
import { bootHarness, type Fixture, type Harness } from "./harness";

/**
 * Role-aware dashboards (GET /dashboard, /children) and the parent "linked child" allowance on results, analytics and
 * syllabus progress. Fixtures: institute A (the data), institute B (the intruder).
 */
let h: Harness;
let A: Fixture;
let B: Fixture;
const cookie: Record<string, string> = {};
const api = (who: string, inst: Fixture = A) => h.as(cookie[who]!, inst.institute.id);

const releasedAttempt = randomUUID();
const unreleasedAttempt = randomUUID();
const otherStudentAttempt = randomUUID();
let testId: string;

async function addEvaluation(f: Fixture, attemptId: string, studentUserId: string, testId: string, opts: { score: number; released: boolean }) {
  await h.db.insert(evaluations).values({
    instituteId: f.institute.id, attemptId, testId, studentId: studentUserId, batchId: f.batchId, version: 1, keyVersion: 1, schemeVersion: 1,
    score: opts.score, maxScore: 100, correct: 5, incorrect: 2, unanswered: 1, accuracy: 71.4, sections: [],
    isCurrent: true, releasedAt: opts.released ? new Date(Date.now() - 60_000) : null,
  });
}

beforeAll(async () => {
  h = await bootHarness();
  A = await h.createInstitute("dash-a");
  B = await h.createInstitute("dash-b");
  for (const [k, p] of Object.entries({ aAdmin: A.admin, aTeacher: A.teacher, aStudent: A.student, aParent: A.parent, bAdmin: B.admin, bParent: B.parent })) {
    cookie[k] = await h.login(p.email);
  }
  const [t] = await h.db.insert(tests).values({
    instituteId: A.institute.id, paperId: randomUUID(), title: "Mock A1", presetKey: "nta", config: {}, sections: [],
    batchIds: [A.batchId], durationMinutes: 60, windowStart: new Date(Date.now() - 3600_000), windowEnd: new Date(Date.now() + 86_400_000),
    status: "published",
  }).returning({ id: tests.id });
  testId = t!.id;
  // a second published test for the OTHER batch: the student must not see it as upcoming
  await h.db.insert(tests).values({
    instituteId: A.institute.id, paperId: randomUUID(), title: "Mock other batch", presetKey: "nta", config: {}, sections: [],
    batchIds: [A.otherBatchId], durationMinutes: 60, windowStart: new Date(Date.now() + 3600_000), windowEnd: new Date(Date.now() + 86_400_000),
    status: "published",
  });
  await h.db.insert(attempts).values({ instituteId: A.institute.id, testId, studentId: A.student.userId, status: "submitted", deadline: new Date() });
  await addEvaluation(A, releasedAttempt, A.student.userId, testId, { score: 70, released: true });
  await addEvaluation(A, unreleasedAttempt, A.student.userId, randomUUID(), { score: 10, released: false });
  await addEvaluation(B, otherStudentAttempt, B.student.userId, randomUUID(), { score: 99, released: true });
});
afterAll(async () => h?.close());

describe("GET /dashboard", () => {
  it("admin: real counts and the signed-in user's name", async () => {
    const res = await api("aAdmin").get("/api/v1/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("institute_admin");
    expect(res.body.user.email).toBe(A.admin.email);
    expect(res.body.institute.name).toBe(A.institute.name);
    expect(res.body.stats).toMatchObject({ activeStudents: 1, teachers: 1, parents: 1, batches: 2, testsThisWeek: expect.any(Number), evaluatedAttempts: 2 });
    expect(res.body.upcomingTests.map((t: any) => t.title)).toContain("Mock A1");
    expect(res.body.upcomingTests.find((t: any) => t.title === "Mock A1").batchNames).toEqual([A.institute.slug + "-batch-1"]);
    expect(res.body.badges).toMatchObject({ papersToReview: 0, flags: 0 });
    // never contains institute B's numbers or ids
    expect(JSON.stringify(res.body)).not.toContain(B.institute.id);
  });

  it("teacher: only their own batches", async () => {
    const res = await api("aTeacher").get("/api/v1/dashboard");
    expect(res.body.role).toBe("teacher");
    expect(res.body.stats).toMatchObject({ batches: 1, students: 1 });
    expect(res.body.batchPerformance).toHaveLength(1);
    expect(res.body.batchPerformance[0].name).toBe(A.institute.slug + "-batch-1");
  });

  it("student: released results only, upcoming only for their batch", async () => {
    const res = await api("aStudent").get("/api/v1/dashboard");
    expect(res.body.role).toBe("student");
    expect(res.body.stats).toMatchObject({ testsAttempted: 1, resultsReleased: 1, avgScorePct: 70, bestScorePct: 70 });
    expect(res.body.recentResults).toHaveLength(1);
    expect(res.body.recentResults[0].score).toBe(70);
    // the batch test they already submitted is not "upcoming"; the other batch's test never is
    expect(res.body.upcomingTests).toEqual([]);
    expect(res.body.badges.upcomingTests).toBe(0);
  });

  it("parent: the linked child's data; a foreign childId is ignored", async () => {
    const own = await api("aParent").get(`/api/v1/dashboard?childId=${A.student.profileId}`);
    expect(own.body.role).toBe("parent");
    expect(own.body.child.studentId).toBe(A.student.profileId);
    expect(own.body.stats).toMatchObject({ testsAttempted: 1, avgScorePct: 70 });
    expect(own.body.recentResults).toHaveLength(1);

    // institute B's parent asking for A's child gets B's own child, never A's
    const foreign = await api("bParent", B).get(`/api/v1/dashboard?childId=${A.student.profileId}`);
    expect(foreign.status).toBe(200);
    expect(foreign.body.child.studentId).toBe(B.student.profileId);
    expect(JSON.stringify(foreign.body)).not.toContain(A.student.userId);
  });

  it("GET /children is the parent's verified links, empty for others", async () => {
    expect((await api("aParent").get("/api/v1/children")).body.map((c: any) => c.studentId)).toEqual([A.student.profileId]);
    expect((await api("aAdmin").get("/api/v1/children")).body).toEqual([]);
  });
});

describe("parent: linked child's results and analytics", () => {
  it("lists only released results of linked children", async () => {
    const res = await api("aParent").get("/api/v1/results/mine");
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.attemptId)).toEqual([releasedAttempt]);
    const one = await api("aParent").get(`/api/v1/results/mine?childId=${A.student.userId}`);
    expect(one.body).toHaveLength(1);
  });

  it("childId must be a verified link (404 otherwise, incl. other institutes)", async () => {
    expect((await api("aParent").get(`/api/v1/results/mine?childId=${B.student.userId}`)).status).toBe(404);
    expect((await api("aParent").get(`/api/v1/results/mine?childId=${randomUUID()}`)).status).toBe(404);
  });

  it("reads a released attempt of the child, not an unreleased or foreign one", async () => {
    expect((await api("aParent").get(`/api/v1/results/${releasedAttempt}`)).status).toBe(200);
    expect((await api("aParent").get(`/api/v1/results/${unreleasedAttempt}`)).status).toBe(403);
    expect((await api("aParent").get(`/api/v1/results/${otherStudentAttempt}`)).status).toBe(404);
    expect((await api("bParent", B).get(`/api/v1/results/${releasedAttempt}`)).status).toBe(404);
  });

  it("analytics: own child only", async () => {
    expect((await api("aParent").get(`/api/v1/analytics/students/${A.student.userId}`)).status).toBe(200);
    expect((await api("aParent").get(`/api/v1/analytics/students/${B.student.userId}`)).status).toBe(403);
    expect((await api("bParent", B).get(`/api/v1/analytics/students/${A.student.userId}`)).status).toBe(403);
  });

  it("a revoked link grants nothing", async () => {
    const res = await api("aAdmin").delete(`/api/v1/guardian-links/${A.parent.profileId}/${A.student.profileId}`);
    expect(res.status).toBe(200);
    // the guard resolves links per request, so the next call already sees no child
    expect((await api("aParent").get("/api/v1/children")).body).toEqual([]);
    expect((await api("aParent").get(`/api/v1/results/${releasedAttempt}`)).status).toBe(404);
    expect((await api("aAdmin").get("/api/v1/guardian-links")).body).toEqual([]);
    // re-linking a revoked link works (no unique-index collision)
    const again = await api("aAdmin").post("/api/v1/guardian-links", { guardianId: A.parent.profileId, studentId: A.student.profileId });
    expect(again.status).toBe(201);
    const links = (await api("aAdmin").get("/api/v1/guardian-links")).body;
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ status: "verified", guardianName: "parent", studentName: "student" });
    expect((await api("aAdmin").post("/api/v1/guardian-links", { guardianId: A.parent.profileId, studentId: A.student.profileId })).status).toBe(409);
  });
});

describe("syllabus authorisation", () => {
  const nodeBody = { parentId: null, level: "exam", name: "Mine" };
  it("only admins edit the structure", async () => {
    expect((await api("aStudent").post("/api/v1/syllabus/nodes", nodeBody)).status).toBe(403);
    expect((await api("aTeacher").post("/api/v1/syllabus/nodes", nodeBody)).status).toBe(403);
    expect((await api("aParent").post("/api/v1/syllabus/nodes", nodeBody)).status).toBe(403);
    expect((await api("aAdmin").post("/api/v1/syllabus/nodes", nodeBody)).status).toBe(201);
  });

  it("every institute role can read the tree", async () => {
    for (const who of ["aAdmin", "aTeacher", "aStudent", "aParent"]) expect((await api(who).get("/api/v1/syllabus/tree")).status, who).toBe(200);
  });

  it("progress: teacher writes own batch only; student/parent read their batch only", async () => {
    const tree = (await api("aAdmin").get("/api/v1/syllabus/tree")).body as { id: string }[];
    const exam = tree[0]!.id;
    const subject = (await api("aAdmin").post("/api/v1/syllabus/nodes", { parentId: exam, level: "subject", name: "S" })).body.id;
    const unit = (await api("aAdmin").post("/api/v1/syllabus/nodes", { parentId: subject, level: "unit", name: "U" })).body.id;
    const chapter = (await api("aAdmin").post("/api/v1/syllabus/nodes", { parentId: unit, level: "chapter", name: "C" })).body.id;
    const topic = (await api("aAdmin").post("/api/v1/syllabus/nodes", { parentId: chapter, level: "topic", name: "T" })).body.id;

    const base = (b: string) => `/api/v1/syllabus/batches/${b}/progress`;

    // the harness wrapper has no PUT helper: build one from supertest directly
    const request = (await import("supertest")).default;
    const putAs = (who: string, batch: string, status = "completed") =>
      request(h.app.getHttpServer()).put(`${base(batch)}/${topic}`).set("Cookie", cookie[who]!).set("Origin", h.env.WEB_ORIGIN).set("x-institute-id", A.institute.id).send({ status });

    expect((await putAs("aStudent", A.batchId)).status).toBe(403);
    expect((await putAs("aParent", A.batchId)).status).toBe(403);
    expect((await putAs("aTeacher", A.otherBatchId)).status).toBe(404); // not their batch
    expect((await putAs("aTeacher", A.batchId)).status).toBe(200);

    const seen = await api("aStudent").get(base(A.batchId));
    expect(seen.status).toBe(200);
    expect(seen.body.overallPercent).toBe(100);
    expect((await api("aParent").get(base(A.batchId))).body.overallPercent).toBe(100);
    expect((await api("aStudent").get(base(A.otherBatchId))).status).toBe(404);
    expect((await api("aParent").get(base(A.otherBatchId))).status).toBe(404);
    expect((await api("aTeacher").get(base(A.otherBatchId))).status).toBe(404);
  });
});

describe("batches", () => {
  it("list carries roster counts and students see only their own batch", async () => {
    const admin = (await api("aAdmin").get("/api/v1/batches")).body as any[];
    const b1 = admin.find((b) => b.id === A.batchId);
    expect(b1).toMatchObject({ studentCount: 1, teacherCount: 1 });
    expect(admin.find((b) => b.id === A.otherBatchId)).toMatchObject({ studentCount: 0, teacherCount: 0 });
    const student = (await api("aStudent").get("/api/v1/batches")).body as any[];
    expect(student.map((b) => b.id)).toEqual([A.batchId]);
  });

  it("people list shows batch and child names", async () => {
    const students = (await api("aAdmin").get("/api/v1/users?role=student")).body as any[];
    expect(students[0].batchNames).toEqual([A.institute.slug + "-batch-1"]);
    const parents = (await api("aAdmin").get("/api/v1/users?role=parent")).body as any[];
    expect(parents[0].childNames).toEqual(["student"]);
  });
});

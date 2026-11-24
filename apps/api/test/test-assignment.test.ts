import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accounts, memberships, students, users } from "@cbt/db";
import { bootHarness, PASSWORD, type Fixture, type Harness } from "./harness";
import { AUTH } from "../src/common/auth/auth.module";

/** Test assignment: batch-scoped access, staff/student listings, role gates. Runs on the real app + RLS (PGlite). */
let h: Harness;
let A: Fixture; // batch-1: teacher + student enrolled; batch-2: nobody
let B: Fixture;
let outsider: { email: string; userId: string }; // student of A's institute, enrolled nowhere
let admin: ReturnType<Harness["as"]>;
let teacher: ReturnType<Harness["as"]>;
let student: ReturnType<Harness["as"]>;
let outsiderApi: ReturnType<Harness["as"]>;
let adminB: ReturnType<Harness["as"]>;
let studentB: ReturnType<Harness["as"]>;

const uuid = () => crypto.randomUUID();
const day = 86_400_000;
const section = () => [{ name: "General", questionIds: [uuid(), uuid()] }];
const body = (over: Record<string, unknown> = {}) => ({
  title: "Assignment Test", paperId: uuid(), presetKey: "nta", durationMinutes: 30, sections: section(),
  windowStart: new Date(Date.now() - 60_000).toISOString(), windowEnd: new Date(Date.now() + 7 * day).toISOString(), ...over,
});

async function publish(api: typeof admin, over: Record<string, unknown> = {}) {
  const created = await api.post("/api/v1/tests", body(over));
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const pub = await api.post(`/api/v1/tests/${created.body.id}/publish`);
  expect(pub.status, JSON.stringify(pub.body)).toBeLessThan(300);
  return created.body.id as string;
}

beforeAll(async () => {
  h = await bootHarness();
  A = await h.createInstitute("assign-a");
  B = await h.createInstitute("assign-b");
  const hash: string = await ((await (h.app.get(AUTH) as any).$context).password.hash(PASSWORD));
  const [u] = await h.db.insert(users).values({ email: "outsider@assign-a.test", name: "Outsider", emailVerified: true }).returning({ id: users.id });
  await h.db.insert(accounts).values({ accountId: u!.id, providerId: "credential", userId: u!.id, password: hash });
  const [m] = await h.db.insert(memberships).values({ organizationId: A.institute.id, userId: u!.id, role: "student" }).returning({ id: memberships.id });
  await h.db.insert(students).values({ instituteId: A.institute.id, membershipId: m!.id, userId: u!.id, rollNo: "OUT-1" });
  outsider = { email: "outsider@assign-a.test", userId: u!.id };

  admin = h.as(await h.login(A.admin.email), A.institute.id);
  teacher = h.as(await h.login(A.teacher.email), A.institute.id);
  student = h.as(await h.login(A.student.email), A.institute.id);
  outsiderApi = h.as(await h.login(outsider.email), A.institute.id);
  adminB = h.as(await h.login(B.admin.email), B.institute.id);
  studentB = h.as(await h.login(B.student.email), B.institute.id);
});
afterAll(async () => h?.close());

describe("startAttempt enforces batch enrolment", () => {
  it("enrolled student starts and resumes; a student outside the batch gets 403", async () => {
    const id = await publish(admin, { title: "Batch 1 only", batchIds: [A.batchId] });
    const ok = await student.post(`/api/v1/tests/${id}/attempts`);
    expect(ok.status, JSON.stringify(ok.body)).toBeLessThan(300);
    const again = await student.post(`/api/v1/tests/${id}/attempts`);
    expect(again.body.attemptId).toBe(ok.body.attemptId); // resume
    const denied = await outsiderApi.post(`/api/v1/tests/${id}/attempts`);
    expect(denied.status).toBe(403);
  });

  it("a test for another batch of the same institute is closed to a student enrolled elsewhere", async () => {
    const id = await publish(admin, { title: "Batch 2 only", batchIds: [A.otherBatchId] });
    expect((await student.post(`/api/v1/tests/${id}/attempts`)).status).toBe(403);
  });

  it("empty batchIds means the whole institute", async () => {
    const id = await publish(admin, { title: "Everyone", batchIds: [] });
    expect((await outsiderApi.post(`/api/v1/tests/${id}/attempts`)).status).toBeLessThan(300);
    expect((await student.post(`/api/v1/tests/${id}/attempts`)).status).toBeLessThan(300);
  });

  it("other institutes' students get 404, staff and parents cannot start attempts", async () => {
    const id = await publish(admin, { title: "Tenant", batchIds: [A.batchId] });
    expect((await studentB.post(`/api/v1/tests/${id}/attempts`)).status).toBe(404);
    expect((await admin.post(`/api/v1/tests/${id}/attempts`)).status).toBe(403);
    expect((await teacher.post(`/api/v1/tests/${id}/attempts`)).status).toBe(403);
    expect((await h.as(await h.login(A.parent.email), A.institute.id).post(`/api/v1/tests/${id}/attempts`)).status).toBe(403);
  });

  it("window rules still apply to enrolled students", async () => {
    const future = await publish(admin, { title: "Later", batchIds: [A.batchId], windowStart: new Date(Date.now() + day).toISOString(), windowEnd: new Date(Date.now() + 2 * day).toISOString() });
    expect((await student.post(`/api/v1/tests/${future}/attempts`)).status).toBe(403);
  });
});

describe("creating tests", () => {
  it("rejects unknown and foreign batch ids; students cannot create or publish", async () => {
    expect((await admin.post("/api/v1/tests", body({ batchIds: [uuid()] }))).status).toBe(400);
    expect((await admin.post("/api/v1/tests", body({ batchIds: [B.batchId] }))).status).toBe(400); // RLS hides B's batch
    expect((await student.post("/api/v1/tests", body())).status).toBe(403);
    expect((await student.post(`/api/v1/tests/${uuid()}/publish`)).status).toBe(403);
  });

  it("a teacher can only target batches they teach", async () => {
    expect((await teacher.post("/api/v1/tests", body({ batchIds: [A.otherBatchId] }))).status).toBe(403);
    expect((await teacher.post("/api/v1/tests", body({ batchIds: [A.batchId] }))).status).toBe(201);
    // a draft aimed at a batch the teacher does not teach cannot be published by the teacher either
    const draft = await admin.post("/api/v1/tests", body({ batchIds: [A.otherBatchId] }));
    expect((await teacher.post(`/api/v1/tests/${draft.body.id}/publish`)).status).toBe(403);
  });

  it("dedupes batch ids", async () => {
    const r = await admin.post("/api/v1/tests", body({ batchIds: [A.batchId, A.batchId] }));
    expect(r.status).toBe(201);
    expect(r.body.batchIds).toEqual([A.batchId]);
  });
});

describe("GET /api/v1/tests (staff)", () => {
  it("lists status, window, batches and attempt counts; scoped to the institute and the teacher's batches", async () => {
    const mine = await publish(admin, { title: "Listing: batch 1", batchIds: [A.batchId] });
    const other = await publish(admin, { title: "Listing: batch 2", batchIds: [A.otherBatchId] });
    await student.post(`/api/v1/tests/${mine}/attempts`);

    const asAdmin = await admin.get("/api/v1/tests");
    expect(asAdmin.status).toBe(200);
    const row = asAdmin.body.find((t: any) => t.id === mine);
    expect(row).toMatchObject({
      title: "Listing: batch 1", status: "published", windowState: "open", batchIds: [A.batchId],
      batches: [{ id: A.batchId, name: "assign-a-batch-1" }], attemptCount: 1, submittedCount: 0, presetKey: "nta", questionCount: 2,
    });
    expect(asAdmin.body.some((t: any) => t.id === other)).toBe(true);

    const asTeacher = await teacher.get("/api/v1/tests");
    expect(asTeacher.status).toBe(200);
    expect(asTeacher.body.some((t: any) => t.id === mine)).toBe(true);
    expect(asTeacher.body.some((t: any) => t.id === other)).toBe(false);

    expect((await student.get("/api/v1/tests")).status).toBe(403);
    // never leaks across institutes
    const asB = await adminB.get("/api/v1/tests");
    expect(asB.status).toBe(200);
    expect(JSON.stringify(asB.body)).not.toContain(mine);
  });
});

describe("GET /api/v1/tests/upcoming (student)", () => {
  it("shows only the student's batches with their attempt state; submitted tests offer the result", async () => {
    const mine = await publish(admin, { title: "Up: mine", batchIds: [A.batchId] });
    const other = await publish(admin, { title: "Up: other batch", batchIds: [A.otherBatchId] });
    const everyone = await publish(admin, { title: "Up: everyone" });
    const draft = (await admin.post("/api/v1/tests", body({ title: "Up: draft", batchIds: [A.batchId] }))).body.id;

    let list = (await student.get("/api/v1/tests/upcoming")).body as any[];
    const ids = list.map((t) => t.id);
    expect(ids).toContain(mine);
    expect(ids).toContain(everyone);
    expect(ids).not.toContain(other);
    expect(ids).not.toContain(draft);
    const row = list.find((t) => t.id === mine);
    expect(row).toMatchObject({
      title: "Up: mine", presetKey: "nta", presetName: "NTA-style (default)", durationMinutes: 30, windowState: "open",
      attemptState: "not_started", attemptId: null, resultAvailable: false, canStart: true,
    });

    const started = await student.post(`/api/v1/tests/${mine}/attempts`);
    list = (await student.get("/api/v1/tests/upcoming")).body;
    expect(list.find((t) => t.id === mine)).toMatchObject({ attemptState: "in_progress", attemptId: started.body.attemptId, canStart: true });

    const sub = await student.post(`/api/v1/attempts/${started.body.attemptId}/submit`);
    expect(sub.status).toBeLessThan(300);
    list = (await student.get("/api/v1/tests/upcoming")).body;
    expect(list.find((t) => t.id === mine)).toMatchObject({ attemptState: "submitted", canStart: false });

    // the outsider is enrolled nowhere: whole-institute tests only, and never someone else's attempt
    const outsiderList = (await outsiderApi.get("/api/v1/tests/upcoming")).body as any[];
    expect(outsiderList.map((t) => t.id)).toContain(everyone);
    expect(outsiderList.map((t) => t.id)).not.toContain(mine);
  });

  it("is student-only and tenant-scoped", async () => {
    expect((await admin.get("/api/v1/tests/upcoming")).status).toBe(403);
    expect((await teacher.get("/api/v1/tests/upcoming")).status).toBe(403);
    const asB = await studentB.get("/api/v1/tests/upcoming");
    expect(asB.status).toBe(200);
    expect(asB.body).toEqual([]);
  });

  it("hides tests whose window has closed unless the student attempted them", async () => {
    const closed = await publish(admin, { title: "Up: closed", batchIds: [A.batchId], windowStart: new Date(Date.now() - 3 * day).toISOString(), windowEnd: new Date(Date.now() - 2 * day).toISOString() });
    const list = (await student.get("/api/v1/tests/upcoming")).body as any[];
    expect(list.map((t) => t.id)).not.toContain(closed);
  });
});

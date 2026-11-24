import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { students } from "@cbt/db";
import { bootHarness, PASSWORD, type Fixture, type Harness } from "./harness";
import { Notifier, type LogNotifier } from "../src/common/adapters/notifier";

let h: Harness;
beforeAll(async () => {
  h = await bootHarness();
});
afterAll(async () => h?.close());

describe("M1: institute lifecycle (FR-001, FR-002, FR-004, FR-005, FR-007)", () => {
  let instituteId: string;
  it("registers as pending and cannot use the platform until approved", async () => {
    const res = await h.http().post("/api/v1/institutes").send({
      name: "Lifecycle Academy", adminName: "Lia Admin", adminEmail: "lia@lifecycle.test", password: PASSWORD,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    instituteId = res.body.id;

    const cookie = await h.login("lia@lifecycle.test");
    const blocked = await h.as(cookie).get("/api/v1/batches");
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("INSTITUTE_PENDING");
  });

  it("rejects weak input and duplicate registration", async () => {
    expect((await h.http().post("/api/v1/institutes").send({ name: "x" })).status).toBe(400);
    const dupe = await h.http().post("/api/v1/institutes").send({
      name: "Lifecycle Academy", adminName: "Lia Admin", adminEmail: "other@lifecycle.test", password: PASSWORD,
    });
    expect(dupe.status).toBe(409);
  });

  it("super admin approves, then the institute works; suspension blocks access and login", async () => {
    await h.createSuperAdmin();
    const su = await h.login("owner@platform.test");
    const sa = h.as(su);

    const list = await sa.get("/api/v1/institutes?status=pending");
    expect(list.body.some((i: any) => i.id === instituteId)).toBe(true);
    expect((await sa.get("/api/v1/batches")).status).toBe(403); // super admin has no tenant data access

    expect((await sa.post(`/api/v1/institutes/${instituteId}/approve`)).status).toBe(200);
    const notifier = h.app.get<LogNotifier>(Notifier as any);
    expect(notifier.sent.some((n) => n.template === "institute-approved" && n.to === "lia@lifecycle.test")).toBe(true);

    const adminCookie = await h.login("lia@lifecycle.test");
    const admin = h.as(adminCookie);
    expect((await admin.get("/api/v1/batches")).status).toBe(200);
    const me = await admin.get("/api/v1/me");
    expect(me.body.role).toBe("institute_admin");
    expect(me.body.rules.length).toBeGreaterThan(0);

    expect((await sa.post(`/api/v1/institutes/${instituteId}/suspend`)).status).toBe(200);
    expect((await admin.get("/api/v1/batches")).status).toBe(403); // existing session blocked
    await expect(h.login("lia@lifecycle.test")).rejects.toThrow(/login failed/); // FR-002: cannot log in

    expect((await sa.post(`/api/v1/institutes/${instituteId}/suspend`)).status).toBe(400); // already suspended
    expect((await sa.post(`/api/v1/institutes/${instituteId}/reactivate`)).status).toBe(200);
    expect((await h.as(await h.login("lia@lifecycle.test")).get("/api/v1/batches")).status).toBe(200);
  });

  it("audits institute status changes (visible to the super admin)", async () => {
    const su = h.as(await h.login("owner@platform.test"));
    const logs = await su.get(`/api/v1/audit-logs?entity=institutes&instituteId=${instituteId}`);
    expect(logs.status).toBe(200);
    const actions = logs.body.map((l: any) => `${l.action}:${l.after?.status ?? ""}`);
    expect(actions).toEqual(expect.arrayContaining(["insert:pending", "update:approved", "update:suspended"]));
    const approve = logs.body.find((l: any) => l.after?.status === "approved");
    expect(approve.actorRole).toBe("super_admin");
  });

  it("wrong password is rejected", async () => {
    const res = await h.http().post("/api/v1/auth/sign-in/email").set("Origin", h.env.WEB_ORIGIN).send({ email: "lia@lifecycle.test", password: "nope-nope-nope" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("M2: people, batches, role scoping", () => {
  let A: Fixture;
  beforeAll(async () => {
    A = await h.createInstitute("people");
  });

  it("admin creates a student into a batch; duplicates are 409", async () => {
    const admin = h.as(await h.login(A.admin.email));
    const res = await admin.post("/api/v1/users", { role: "student", name: "New Kid", email: "kid@people.test", rollNo: "R77", batchIds: [A.batchId] });
    expect(res.status).toBe(201);
    const again = await admin.post("/api/v1/users", { role: "student", name: "New Kid", email: "kid@people.test" });
    expect(again.status).toBe(409);
    const rollDupe = await admin.post("/api/v1/users", { role: "student", name: "Other", email: "kid2@people.test", rollNo: "R77" });
    expect(rollDupe.status).toBe(409);
    expect(rollDupe.body.field).toBe("roll_no");
    const batch = await admin.get(`/api/v1/batches/${A.batchId}`);
    expect(batch.body.studentCount).toBe(2);
  });

  it("a student cannot be enrolled twice in the same batch", async () => {
    const admin = h.as(await h.login(A.admin.email));
    const r = await admin.post(`/api/v1/batches/${A.batchId}/students`, { studentIds: [A.student.profileId] });
    expect(r.body).toEqual({ enrolled: 0, alreadyEnrolled: 1 });
  });

  it("teachers see only their own batches and students; students/parents cannot manage people", async () => {
    const teacher = h.as(await h.login(A.teacher.email));
    const batches = await teacher.get("/api/v1/batches");
    expect(batches.body.map((b: any) => b.id)).toEqual([A.batchId]);
    expect((await teacher.get(`/api/v1/batches/${A.otherBatchId}`)).status).toBe(404);
    expect((await teacher.post("/api/v1/users", { role: "student", name: "x", email: "x@people.test" })).status).toBe(403);
    expect((await teacher.post("/api/v1/batches", { name: "nope" })).status).toBe(403);
    const people = await teacher.get("/api/v1/users");
    expect(people.body.every((p: any) => p.role === "student")).toBe(true);

    for (const who of [A.student, A.parent]) {
      const api = h.as(await h.login(who.email));
      expect((await api.get("/api/v1/users")).status).toBe(403);
      expect((await api.post("/api/v1/batches", { name: "x" })).status).toBe(403);
      expect((await api.get("/api/v1/audit-logs")).status).toBe(403);
    }
  });

  it("deactivating a user is soft, audited, and blocks that membership", async () => {
    const admin = h.as(await h.login(A.admin.email));
    const sCookie = await h.login(A.student.email);
    expect((await h.as(sCookie).get("/api/v1/me")).status).toBe(200);
    const del = await admin.delete(`/api/v1/users/${A.student.userId}`);
    expect(del.status).toBe(200);
    expect((await h.as(sCookie).get("/api/v1/me")).status).toBe(403);
    const logs = await admin.get(`/api/v1/audit-logs?entityId=${A.student.userId}`);
    expect(logs.body.some((l: any) => l.action === "user.deactivate")).toBe(true);
  });
});

describe("M2: CSV import (AT: 1,000 rows with per-row errors)", () => {
  let A: Fixture;
  beforeAll(async () => {
    A = await h.createInstitute("import");
  });

  it("imports 1,000 rows, reporting each bad row and applying the rest", async () => {
    const admin = h.as(await h.login(A.admin.email));
    const lines = ["role,name,email,phone,roll_no,dob,employee_code,relation,batches,children"];
    const bad = new Set<number>();
    for (let i = 1; i <= 1000; i++) {
      const line = i + 1;
      if (i % 100 === 0) { bad.add(line); lines.push(`student,Bad Email ${i},not-an-email,,IR${i},,,,,`); }
      else if (i % 100 === 50) { bad.add(line); lines.push(`student,Bad Batch ${i},s${i}@import.test,,IR${i},,,,No-Such-Batch,`); }
      else if (i % 100 === 25) { bad.add(line); lines.push(`student,Bad Date ${i},s${i}@import.test,,IR${i},31/12/2008,,,,`); }
      else if (i === 7) { bad.add(line); lines.push(`student,Dup Email,s6@import.test,,IR7,,,,,`); } // duplicate of the row for i=6
      else lines.push(`student,Student ${i},s${i}@import.test,,IR${i},2008-01-15,,,import-batch-1,`);
    }
    const t0 = Date.now();
    const res = await admin.post("/api/v1/imports/users", { csv: lines.join("\n"), filename: "bulk.csv" });
    const ms = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(res.body.totalRows).toBe(1000);
    expect(res.body.failedRows).toBe(bad.size);
    expect(res.body.succeededRows).toBe(1000 - bad.size);
    const errRows = new Set<number>(res.body.errors.map((e: any) => e.row));
    expect(errRows).toEqual(bad);
    expect(res.body.errors.find((e: any) => e.field === "email")).toBeTruthy();
    expect(res.body.errors.find((e: any) => e.field === "batches")).toBeTruthy();
    expect(res.body.errors.find((e: any) => e.field === "dob")).toBeTruthy();
    console.log(`1000-row import: ${ms} ms, ${res.body.failedRows} failed`);

    const all = await h.db.select({ id: students.id }).from(students).where(eq(students.instituteId, A.institute.id));
    expect(all.length).toBe(1 + (1000 - bad.size)); // fixture student + imported

    const report = await admin.get(`/api/v1/imports/${res.body.id}/errors.csv`);
    expect(report.status).toBe(200);
    expect(report.text.trim().split("\n").length).toBe(bad.size + 1);
    expect(report.text).toMatch(/Unknown batch/);

    const status = await admin.get(`/api/v1/imports/${res.body.id}`);
    expect(status.body.failedRows).toBe(bad.size);
  }, 120_000);

  it("re-importing a person already in the institute reports it and continues", async () => {
    const admin = h.as(await h.login(A.admin.email));
    const csv = "role,name,email,roll_no\nstudent,Student 1,s1@import.test,IR1\nstudent,Brand New,fresh@import.test,IRX\n";
    const res = await admin.post("/api/v1/imports/users", { csv });
    expect(res.body.succeededRows).toBe(1);
    expect(res.body.errors).toEqual([{ row: 2, field: "email", message: "This person is already a member of the institute" }]);
  });

  it("rejects files missing required columns", async () => {
    const admin = h.as(await h.login(A.admin.email));
    expect((await admin.post("/api/v1/imports/users", { csv: "foo,bar\n1,2\n" })).status).toBe(400);
    expect((await admin.post("/api/v1/imports/users", {})).status).toBe(400);
  });
});

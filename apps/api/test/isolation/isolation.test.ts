import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { auditLog, batches, findUnprotectedTenantTables, institutes, students, withTenant } from "@cbt/db";
import { bootHarness, listRoutes, type Fixture, type Harness } from "../harness";
import { CASES, NOT_TENANT_DATA } from "./cases";

let h: Harness;
let A: Fixture;
let B: Fixture;
let cookieB: string;

beforeAll(async () => {
  h = await bootHarness();
  A = await h.createInstitute("alpha");
  B = await h.createInstitute("bravo");
  cookieB = await h.login(B.admin.email);
});
afterAll(async () => {
  await h?.close();
});

describe("database layer (RLS)", () => {
  it("every table with an institute_id column has RLS enabled and a policy", async () => {
    expect(await findUnprotectedTenantTables(h.db)).toEqual([]);
  });

  it("institute B cannot read A's rows", async () => {
    const seen = await withTenant(h.db, { instituteId: B.institute.id, userId: B.admin.userId, role: "institute_admin" }, async (tx) => ({
      batches: await tx.select().from(batches),
      students: await tx.select().from(students),
      institutes: await tx.select().from(institutes),
    }));
    expect(seen.batches.every((b) => b.instituteId === B.institute.id)).toBe(true);
    expect(seen.students.every((s) => s.instituteId === B.institute.id)).toBe(true);
    expect(seen.institutes.map((i) => i.id)).toEqual([B.institute.id]);
  });

  it("no tenant context means no rows (fail closed)", async () => {
    const seen = await withTenant(h.db, {}, (tx) => tx.select().from(batches));
    expect(seen).toEqual([]);
  });

  it("B cannot insert, update or delete A's rows (WITH CHECK / USING)", async () => {
    const ctx = { instituteId: B.institute.id, userId: B.admin.userId, role: "institute_admin" };
    await expect(
      withTenant(h.db, ctx, (tx) => tx.insert(batches).values({ instituteId: A.institute.id, name: "evil", year: 2026 })),
    ).rejects.toThrow();
    const upd = await withTenant(h.db, ctx, (tx) => tx.update(batches).set({ name: "evil" }).where(eq(batches.id, A.batchId)).returning());
    expect(upd).toEqual([]);
    const del = await withTenant(h.db, ctx, (tx) => tx.delete(batches).where(eq(batches.id, A.batchId)).returning());
    expect(del).toEqual([]);
    const [still] = await h.db.select().from(batches).where(eq(batches.id, A.batchId));
    expect(still?.name).toBe("alpha-batch-1");
  });

  it("tenant role cannot read credentials or sessions, nor write users", async () => {
    const ctx = { instituteId: B.institute.id, userId: B.admin.userId, role: "institute_admin" };
    await expect(withTenant(h.db, ctx, (tx) => tx.execute(sql`select password from accounts`))).rejects.toThrow();
    await expect(withTenant(h.db, ctx, (tx) => tx.execute(sql`select token from sessions`))).rejects.toThrow();
    await expect(withTenant(h.db, ctx, (tx) => tx.execute(sql`update users set name = 'x'`))).rejects.toThrow();
    const visible = await withTenant(h.db, ctx, (tx) => tx.execute(sql`select email from users`));
    const emails = ((visible as any).rows ?? visible).map((r: any) => r.email);
    expect(emails.every((e: string) => e.endsWith("@bravo.test"))).toBe(true);
  });

  it("audit_log: written by triggers, scoped per institute, insert-only", async () => {
    const ctx = { instituteId: A.institute.id, userId: A.admin.userId, role: "institute_admin" };
    await withTenant(h.db, ctx, (tx) => tx.update(batches).set({ name: "alpha-renamed" }).where(eq(batches.id, A.batchId)));
    const mine = await withTenant(h.db, ctx, (tx) => tx.select().from(auditLog));
    const hit = mine.find((r) => r.entity === "batches" && r.action === "update" && r.entityId === A.batchId);
    expect(hit).toBeTruthy();
    expect(hit!.actorId).toBe(A.admin.userId);
    expect((hit!.before as any).name).toBe("alpha-batch-1");
    expect(mine.every((r) => r.instituteId === A.institute.id)).toBe(true);

    const theirs = await withTenant(h.db, { instituteId: B.institute.id, userId: B.admin.userId }, (tx) => tx.select().from(auditLog));
    expect(theirs.some((r) => r.instituteId === A.institute.id)).toBe(false);

    // immutable even for the owner connection
    for (const stmt of [sql`update audit_log set action = 'x'`, sql`delete from audit_log`, sql`truncate audit_log`]) {
      const err: any = await h.db.execute(stmt).then(() => null, (e) => e);
      expect(String(err?.cause?.message ?? err?.message)).toMatch(/insert-only/);
    }
    // and tenant code cannot forge entries
    await expect(withTenant(h.db, ctx, (tx) => tx.insert(auditLog).values({ action: "forged", entity: "x" }))).rejects.toThrow();
  });
});

describe("API layer: every endpoint as Institute B against Institute A's data", () => {
  const idsOfA = () => [
    A.institute.id, A.admin.userId, A.teacher.userId, A.student.userId, A.parent.userId,
    A.admin.email, A.teacher.email, A.student.email, A.parent.email, A.batchId, A.otherBatchId,
    A.student.profileId!, A.teacher.profileId!, A.parent.profileId!,
  ];

  for (const c of CASES) {
    it(c.key, async () => {
      const [method, template] = c.key.split(" ") as [string, string];
      void template;
      const api = h.as(cookieB, B.institute.id);
      const path = c.path(A);
      const body = c.body?.(A);
      const res =
        method === "GET" ? await api.get(path)
        : method === "POST" ? await api.post(path, body)
        : method === "PATCH" ? await api.patch(path, body)
        : await api.delete(path);
      const text = JSON.stringify(res.body) + (res.text ?? "");
      if (c.kind === "id") {
        expect([400, 403, 404, 409], `${c.key} -> ${res.status} ${text}`).toContain(res.status);
      } else {
        expect(res.status, `${c.key} -> ${res.status} ${text}`).toBeLessThan(500);
        for (const id of idsOfA()) expect(text, `${c.key} leaked ${id}`).not.toContain(id);
      }
    });
  }

  it("B cannot select A's institute via the x-institute-id header", async () => {
    const res = await h.as(cookieB, A.institute.id).get("/api/v1/batches");
    expect(res.status).toBe(403);
  });

  it("unauthenticated calls are rejected", async () => {
    expect((await h.http().get("/api/v1/batches")).status).toBe(401);
    expect((await h.http().get("/api/v1/users")).status).toBe(401);
  });

  it("platform routes are forbidden to institute admins", async () => {
    const api = h.as(cookieB, B.institute.id);
    expect((await api.get("/api/v1/institutes")).status).toBe(403);
    expect((await api.post(`/api/v1/institutes/${A.institute.id}/approve`)).status).toBe(403);
    expect((await api.post(`/api/v1/institutes/${A.institute.id}/suspend`)).status).toBe(403);
  });

  it("coverage: every registered route has an isolation case (or is declared non-tenant)", () => {
    const covered = new Set(CASES.map((c) => c.key));
    const missing = listRoutes(h.app).map((r) => r.key).filter((k) => !covered.has(k) && !NOT_TENANT_DATA.has(k));
    expect(missing, "add these endpoints to apps/api/test/isolation/cases.ts").toEqual([]);
  });
});

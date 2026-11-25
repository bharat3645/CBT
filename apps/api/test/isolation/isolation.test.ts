import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { auditLog, batches, findUnprotectedTenantTables, institutes, students, withTenant } from "@cbt/db";
import { bootHarness, listRoutes, type Fixture, type Harness, type Person, type Role } from "../harness";
import { CASES, NOT_TENANT_DATA } from "./cases";
import { SECRETS, seedAlpha, type AFix } from "./fixtures";

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

describe("API layer: every endpoint as Institute B against Institute A's real data", () => {
  const ROLES = ["institute_admin", "teacher", "student", "parent"] as const;
  const keyOf = (f: Fixture, r: Role): Person => (r === "institute_admin" ? f.admin : f[r]);
  const bCookies = {} as Record<Role, string>;
  const aCookies = {} as Record<Role, string>;
  let AF: AFix;
  let before: string;

  /** every row of every tenant table that belongs to A, as one comparable string (audit_log excluded: it only grows) */
  async function snapshotA(): Promise<string> {
    const tabs: any = await h.db.execute(sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'institute_id' and table_name <> 'audit_log' order by table_name`);
    const out: string[] = [];
    for (const t of ((tabs as any).rows ?? tabs).map((r: any) => r.table_name as string)) {
      const rows: any = await h.db.execute(sql.raw(`select to_jsonb(t)::text as r from "${t}" t where t.institute_id::text = '${A.institute.id}' order by 1`));
      out.push(`${t}: ${((rows as any).rows ?? rows).map((r: any) => r.r).join("|")}`);
    }
    return out.join(String.fromCharCode(10));
  }

  const planted = () => [
    ...AF.allIds, ...Object.values(SECRETS),
    A.institute.id, A.admin.userId, A.teacher.userId, A.student.userId, A.parent.userId,
    A.admin.email, A.teacher.email, A.student.email, A.parent.email, A.batchId, A.otherBatchId,
    A.student.profileId!, A.teacher.profileId!, A.parent.profileId!,
  ];
  /** like h.as() plus PUT (the shared harness has no put helper) */
  const as = (cookie: string, instituteId: string) => ({
    ...h.as(cookie, instituteId),
    put: (p: string, b?: unknown) => h.http().put(p).set("Cookie", cookie).set("Origin", h.env.WEB_ORIGIN).set("x-institute-id", instituteId).send((b ?? {}) as object),
  });
  const call = (api: ReturnType<typeof as>, method: string, path: string, body: unknown) =>
    method === "GET" ? api.get(path) : method === "POST" ? api.post(path, body) : method === "PUT" ? api.put(path, body)
    : method === "PATCH" ? api.patch(path, body) : api.delete(path);

  beforeAll(async () => {
    AF = await seedAlpha(h, A);
    for (const r of ROLES) {
      bCookies[r] = await h.login(keyOf(B, r).email);
      aCookies[r] = await h.login(keyOf(A, r).email);
    }
    before = await snapshotA();
  });

  for (const c of CASES) {
    const [method] = c.key.split(" ") as [string];
    const callerRole: Role = c.as ?? "institute_admin";

    it(`${c.key} as B ${callerRole}`, async () => {
      const res = await call(as(bCookies[callerRole], B.institute.id), method, c.path(AF), c.body?.(AF));
      const text = JSON.stringify(res.body) + (res.text ?? "");
      expect(res.status, `${c.key} -> ${res.status} ${text}`).toBeLessThan(500);
      if (c.kind === "id") {
        expect([403, 404, ...(c.ok ?? [])], `${c.key} -> ${res.status} ${text}`).toContain(res.status);
      }
      for (const id of planted()) expect(text, `${c.key} leaked ${id}`).not.toContain(id);
    });

    if (c.deny) {
      it(`${c.key} refuses A's ${c.deny}`, async () => {
        const res = await call(as(aCookies[c.deny!], A.institute.id), method, c.path(AF), c.body?.(AF));
        expect([403, 404], `${c.key} as A ${c.deny} -> ${res.status} ${JSON.stringify(res.body)}`).toContain(res.status);
      });
    }

    if (method === "GET" && !c.noPositive) {
      it(`${c.key} positive control: A's ${callerRole} reaches the real row`, async () => {
        const res = await call(as(aCookies[callerRole], A.institute.id), method, c.path(AF), undefined);
        expect(res.status, `${c.key} as A ${callerRole} -> ${res.status} ${JSON.stringify(res.body)}`).toBeLessThan(300);
      });
    }
  }

  it("list endpoints: B sees only its own rows, A's rows are visible to A", async () => {
    const b = as(bCookies.institute_admin, B.institute.id);
    const a = as(aCookies.institute_admin, A.institute.id);
    for (const path of ["/api/v1/tests", "/api/v1/questions", "/api/v1/ingestion/papers", "/api/v1/users?limit=200", "/api/v1/batches", "/api/v1/syllabus/tree"]) {
      const rb = await b.get(path);
      expect(rb.status, path).toBe(200);
      const tb = JSON.stringify(rb.body);
      for (const id of planted()) expect(tb, `${path} leaked ${id}`).not.toContain(id);
      const ra = await a.get(path);
      expect(ra.status, path).toBe(200);
    }
    expect(JSON.stringify((await a.get("/api/v1/tests")).body)).toContain(AF.testId);
    expect(JSON.stringify((await a.get("/api/v1/ingestion/papers")).body)).toContain(AF.paperId);
    expect(JSON.stringify((await a.get("/api/v1/questions")).body)).toContain(AF.questionId);
    expect(JSON.stringify((await as(aCookies.student, A.institute.id).get("/api/v1/notifications")).body)).toContain(AF.notificationId);
    expect(JSON.stringify((await as(bCookies.student, B.institute.id).get("/api/v1/notifications")).body)).not.toContain(AF.notificationId);
  });

  it("B cannot select A's institute via the x-institute-id header", async () => {
    const res = await as(cookieB, A.institute.id).get("/api/v1/batches");
    expect(res.status).toBe(403);
  });

  it("unauthenticated calls are rejected", async () => {
    expect((await h.http().get("/api/v1/batches")).status).toBe(401);
    expect((await h.http().get("/api/v1/users")).status).toBe(401);
  });

  it("platform routes are forbidden to institute admins", async () => {
    const api = as(cookieB, B.institute.id);
    expect((await api.get("/api/v1/institutes")).status).toBe(403);
    expect((await api.post(`/api/v1/institutes/${A.institute.id}/approve`)).status).toBe(403);
    expect((await api.post(`/api/v1/institutes/${A.institute.id}/suspend`)).status).toBe(403);
  });

  it("coverage: every registered route has an isolation case (or is declared non-tenant)", () => {
    const covered = new Set(CASES.map((c) => c.key));
    const missing = listRoutes(h.app).map((r) => r.key).filter((k) => !covered.has(k) && !NOT_TENANT_DATA.has(k));
    expect(missing, "add these endpoints to apps/api/test/isolation/cases.ts").toEqual([]);
  });

  it("after every call above, Institute A's data is byte-for-byte unchanged", async () => {
    expect(await snapshotA()).toBe(before);
  });
});

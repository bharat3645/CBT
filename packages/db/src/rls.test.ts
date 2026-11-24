import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { auditLog, batches, institutes, withTenant, findUnprotectedTenantTables, type DbHandle } from "./index";
import { createTestDb } from "./testing";

let h: DbHandle;
let a: string;
let b: string;
beforeAll(async () => {
  h = await createTestDb();
  [{ id: a }] = (await h.db.insert(institutes).values({ name: "A", slug: "a", status: "approved" }).returning({ id: institutes.id })) as any;
  [{ id: b }] = (await h.db.insert(institutes).values({ name: "B", slug: "b", status: "approved" }).returning({ id: institutes.id })) as any;
  await h.db.insert(batches).values([{ instituteId: a, name: "a1" }, { instituteId: b, name: "b1" }]);
});
afterAll(async () => h?.close());

describe("RLS foundation", () => {
  it("covers every table with institute_id (including other modules)", async () => {
    expect(await findUnprotectedTenantTables(h.db)).toEqual([]);
  });
  it("isolates by institute and fails closed without context", async () => {
    expect((await withTenant(h.db, { instituteId: a }, (tx) => tx.select().from(batches))).map((r) => r.name)).toEqual(["a1"]);
    expect(await withTenant(h.db, {}, (tx) => tx.select().from(batches))).toEqual([]);
    expect((await withTenant(h.db, { isSuperAdmin: true }, (tx) => tx.select().from(batches))).length).toBe(2);
  });
  it("blocks cross-tenant writes", async () => {
    await expect(withTenant(h.db, { instituteId: b }, (tx) => tx.insert(batches).values({ instituteId: a, name: "x" }))).rejects.toThrow();
  });
  it("audits row changes and is insert-only", async () => {
    await withTenant(h.db, { instituteId: a, userId: null }, (tx) => tx.update(batches).set({ name: "a2" }).where(eq(batches.name, "a1")));
    const rows = await withTenant(h.db, { instituteId: a }, (tx) => tx.select().from(auditLog));
    expect(rows.some((r) => r.entity === "batches" && r.action === "update")).toBe(true);
    const err: any = await h.db.execute(sql`delete from audit_log`).then(() => null, (e) => e);
    expect(String(err?.cause?.message ?? err?.message)).toMatch(/insert-only/);
  });
});

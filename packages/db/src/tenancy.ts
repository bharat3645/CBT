import { sql } from "drizzle-orm";
import type { Db } from "./client";

export interface TenantContext {
  instituteId?: string | null;
  userId?: string | null;
  role?: string | null;
  isSuperAdmin?: boolean;
}

/** Inside an open transaction: set the app.* settings and drop to the RLS-subject role. */
export async function applyTenantContext(tx: Db, ctx: TenantContext): Promise<void> {
  await tx.execute(sql`SELECT
    set_config('app.institute_id', ${ctx.instituteId ?? ""}, true),
    set_config('app.user_id', ${ctx.userId ?? ""}, true),
    set_config('app.role', ${ctx.role ?? ""}, true),
    set_config('app.is_super', ${ctx.isSuperAdmin ? "on" : "off"}, true)`);
  await tx.execute(sql`SET LOCAL ROLE cbt_app`);
}

/** Run fn in a transaction where every statement is subject to the tenant's RLS policies. */
export function withTenant<T>(db: Db, ctx: TenantContext, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await applyTenantContext(tx as unknown as Db, ctx);
    return fn(tx as unknown as Db);
  });
}

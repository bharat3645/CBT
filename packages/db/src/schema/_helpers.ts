import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";
import type { PgColumnBuilderBase } from "drizzle-orm/pg-core";
import { institutes } from "./_base";

/**
 * Columns every institute-owned table has (SRS 15): id, institute_id, created_at, updated_at.
 * RLS is NOT declared per table. Any table that has an `institute_id` column gets a tenant policy
 * automatically from `applySecurity()` (src/rls.ts), which runs after every migration.
 * The harness in src/rls.test.ts fails if a tenant table is missing RLS.
 */
export const tenantCols = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  instituteId: uuid("institute_id").notNull().references(() => institutes.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** pgTable with the tenant columns pre-filled. Optional: plain pgTable + an institute_id column works too. */
export function tenantTable<TCols extends Record<string, PgColumnBuilderBase>>(
  name: string,
  cols: TCols,
  extra?: (t: any) => any[],
) {
  return pgTable(name, { ...tenantCols(), ...cols }, extra as any);
}

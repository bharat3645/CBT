/**
 * DEV ONLY. Wipes every tenant row (the Demo Academy and any institute/users created by e2e runs) and reseeds the realistic
 * demo dataset. Keeps the schema, the super admin, global syllabus templates and the (insert-only) audit log.
 * Refuses unless DATABASE_URL points at localhost. Usage: pnpm demo:reset
 */
import { sql } from "drizzle-orm";
import { loadEnv } from "@cbt/config";
import { createDb } from "@cbt/db";

import { runSeed } from "./seed-base";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

async function main() {
  const env = loadEnv();
  const host = new URL(env.DATABASE_URL).hostname;
  if (env.NODE_ENV === "production" || !LOCAL_HOSTS.has(host)) {
    console.error(`Refusing to reset: DATABASE_URL host is "${host}" (NODE_ENV=${env.NODE_ENV}). demo:reset only runs against a local dev database.`);
    process.exit(2);
  }
  const { db, close } = createDb(env.DATABASE_URL, { max: 2 });
  try {
    await db.transaction(async (tx) => {
      // institutes cascade to every table with an FK; the rest (text institute_id columns) are cleared by name.
      await tx.execute(sql`DELETE FROM institutes`);
      const res: any = await tx.execute(sql`
        SELECT c.table_name FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'public' AND c.column_name = 'institute_id' AND c.table_name NOT IN ('audit_log', 'institutes')`);
      const tables: string[] = (Array.isArray(res) ? res : res.rows).map((r: any) => r.table_name);
      for (const t of tables) await tx.execute(sql.raw(`DELETE FROM "${t}" WHERE institute_id IS NOT NULL`));
      // everyone except the platform owner (sessions/accounts cascade, so browsers must log in again)
      await tx.execute(sql`DELETE FROM users WHERE role IS DISTINCT FROM 'super_admin'`);
      await tx.execute(sql`DELETE FROM verifications`);
      console.log(`wiped tenant data (${tables.length} tables + institutes + non-admin users)`);
    });
    await runSeed(db);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

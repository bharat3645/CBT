// In-process Postgres (PGlite) for the tenant-isolation harness and unit tests. No Docker needed.
// Set TEST_DATABASE_URL to run the same suites against a real Postgres instead.
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { createDb, type Db, type DbHandle } from "./client";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite/vector";
import { applySecurity } from "./rls";
import { ensureExtensions } from "./extensions";
import { MIGRATIONS_FOLDER } from "./migrate";
import * as schema from "./schema/index";

export async function createTestDb(): Promise<DbHandle> {
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    const h = createDb(url, { max: 5 });
    await h.db.execute(sql`DROP SCHEMA public CASCADE`);
    await h.db.execute(sql`CREATE SCHEMA public`);
    await ensureExtensions(h.db);
    await migratePg(h.db as any, { migrationsFolder: MIGRATIONS_FOLDER });
    await applySecurity(h.db);
    return h;
  }
  const client = new PGlite({ extensions: { pg_trgm, vector } });
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  await ensureExtensions(db);
  await migratePglite(db as any, { migrationsFolder: MIGRATIONS_FOLDER });
  await applySecurity(db);
  return { db, close: () => client.close() };
}

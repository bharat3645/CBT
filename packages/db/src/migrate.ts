import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { loadEnv } from "@cbt/config";
import { createDb } from "./client";
import { applySecurity } from "./rls";
import { ensureExtensions } from "./extensions";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

/** drizzle migrations, then idempotent RLS/audit/grant SQL (covers tables from every module). */
async function main() {
  const env = loadEnv();
  const { db, close } = createDb(env.DATABASE_URL, { max: 2 });
  try {
    await ensureExtensions(db);
    await migrate(db as any, { migrationsFolder: MIGRATIONS_FOLDER });
    await applySecurity(db);
    console.log("migrations + security applied");
  } finally {
    await close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

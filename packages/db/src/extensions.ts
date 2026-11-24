import { sql } from "drizzle-orm";
import type { Db } from "./client";

/** Run BEFORE migrations: other modules' migrations assume these exist (trigram search, vector duplicate search). */
export const REQUIRED_EXTENSIONS = ["pg_trgm", "vector"];

export async function ensureExtensions(db: Db): Promise<void> {
  for (const ext of REQUIRED_EXTENSIONS) await db.execute(sql.raw(`CREATE EXTENSION IF NOT EXISTS "${ext}"`));
}

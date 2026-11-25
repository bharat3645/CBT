/**
 * Shared seeding entry used by `pnpm --filter api seed` and `pnpm demo:reset`.
 * Super admin + the approved "Demo Academy" institute + demo logins + the realistic dataset (see seed-demo.ts). Idempotent.
 */
import { eq } from "drizzle-orm";
import { loadEnv } from "@cbt/config";
import { institutes, type Db } from "@cbt/db";

import { seedSyllabusTemplates } from "./seed-syllabus";
import { DEMO_PASSWORD, ensureUser, seedDemoAcademy } from "./seed-demo";

export async function runSeed(db: Db): Promise<void> {
  const env = loadEnv();
  await ensureUser(db, env.SUPER_ADMIN_EMAIL, "Platform Owner", env.SUPER_ADMIN_PASSWORD, "super_admin");

  let [inst] = await db.select().from(institutes).where(eq(institutes.slug, "demo-academy")).limit(1);
  if (!inst) {
    [inst] = await db.insert(institutes).values({ name: "Demo Academy", slug: "demo-academy", status: "approved", approvedAt: new Date() }).returning();
  }
  const detail = await seedDemoAcademy(db, inst!.id);
  const templateNodes = await seedSyllabusTemplates(db);
  console.log(`seeded (${templateNodes} new syllabus template nodes); ${detail}.`);
  console.log(`super admin: ${env.SUPER_ADMIN_EMAIL}; demo logins: admin|teacher|student|parent@demo.test / ${DEMO_PASSWORD}`);
}

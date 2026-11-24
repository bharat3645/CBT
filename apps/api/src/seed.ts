/**
 * Dev seed: super admin + one approved demo institute with an admin, teacher, student, parent and a batch.
 * Idempotent. Usage: pnpm --filter api seed   (after pnpm --filter @cbt/db db:migrate)
 * All demo passwords are "Passw0rd!Passw0rd"; the super admin uses SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD.
 */
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { loadEnv } from "@cbt/config";
import {
  accounts, batchTeachers, batches, createDb, enrolments, guardianStudentLinks, guardians, institutes, memberships, students,
  teachers, users, type Db,
} from "@cbt/db";

import { seedSyllabusTemplates } from "./seed-syllabus";

const DEMO_PASSWORD = "Passw0rd!Passw0rd";

async function upsertUser(db: Db, email: string, name: string, password: string, role?: string) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing.id;
  const [u] = await db.insert(users).values({ email, name, emailVerified: true, role: role ?? null }).returning({ id: users.id });
  await db.insert(accounts).values({ accountId: u!.id, providerId: "credential", userId: u!.id, password: await hash(password) });
  return u!.id;
}

async function main() {
  const env = loadEnv();
  const { db, close } = createDb(env.DATABASE_URL, { max: 2 });
  try {
    await upsertUser(db, env.SUPER_ADMIN_EMAIL, "Platform Owner", env.SUPER_ADMIN_PASSWORD, "super_admin");

    let [inst] = await db.select().from(institutes).where(eq(institutes.slug, "demo-academy")).limit(1);
    if (!inst) {
      [inst] = await db.insert(institutes).values({ name: "Demo Academy", slug: "demo-academy", status: "approved", approvedAt: new Date() }).returning();
    }
    const instituteId = inst!.id;

    const person = async (email: string, name: string, role: string) => {
      const userId = await upsertUser(db, email, name, DEMO_PASSWORD);
      const [m] = await db.insert(memberships).values({ organizationId: instituteId, userId, role }).onConflictDoNothing().returning({ id: memberships.id });
      const [mem] = m ? [m] : await db.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId));
      return { userId, membershipId: mem!.id };
    };

    await person("admin@demo.test", "Demo Admin", "institute_admin");
    const t = await person("teacher@demo.test", "Demo Teacher", "teacher");
    const s = await person("student@demo.test", "Demo Student", "student");
    const p = await person("parent@demo.test", "Demo Parent", "parent");

    let [batch] = await db.select().from(batches).where(eq(batches.name, "JEE-2026-A")).limit(1);
    if (!batch) [batch] = await db.insert(batches).values({ instituteId, name: "JEE-2026-A", year: 2026 }).returning();

    const [teacher] = await db.insert(teachers).values({ instituteId, membershipId: t.membershipId, userId: t.userId }).onConflictDoNothing().returning();
    const [student] = await db.insert(students).values({ instituteId, membershipId: s.membershipId, userId: s.userId, rollNo: "R001" }).onConflictDoNothing().returning();
    const [guardian] = await db.insert(guardians).values({ instituteId, membershipId: p.membershipId, userId: p.userId, relation: "Mother" }).onConflictDoNothing().returning();
    if (teacher) await db.insert(batchTeachers).values({ instituteId, batchId: batch!.id, teacherId: teacher.id }).onConflictDoNothing();
    if (student) await db.insert(enrolments).values({ instituteId, batchId: batch!.id, studentId: student.id }).onConflictDoNothing();
    if (student && guardian) {
      await db.insert(guardianStudentLinks).values({ instituteId, guardianId: guardian.id, studentId: student.id, status: "verified" }).onConflictDoNothing();
    }
    const templateNodes = await seedSyllabusTemplates(db);
    console.log(`seeded (${templateNodes} new syllabus template nodes). super admin: ${env.SUPER_ADMIN_EMAIL}; demo logins: admin|teacher|student|parent@demo.test / ${DEMO_PASSWORD}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

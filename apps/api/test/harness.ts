/**
 * Tenant-isolation / API test harness.
 *  - boots the real Nest app on an in-process Postgres (PGlite) with the real migrations + RLS (or TEST_DATABASE_URL)
 *  - fixtures create institutes/users directly (system connection) with real Better Auth credential accounts
 *  - logins go through the real /api/v1/auth/sign-in/email route, so every request is authenticated for real
 */
import "reflect-metadata";
import request from "supertest";
import { ModulesContainer } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import {
  accounts, batches, batchTeachers, enrolments, guardianStudentLinks, guardians, institutes, memberships, students, teachers, users,
  type Db, type DbHandle, type InstituteStatus,
} from "@cbt/db";
import { createTestDb } from "@cbt/db/testing";
import { loadEnv, type Env } from "@cbt/config";
import { createApp } from "../src/bootstrap";
import { AUTH } from "../src/common/auth/auth.module";
import { DB_SYSTEM } from "../src/common/db/db.module";

export const PASSWORD = "Passw0rd!Passw0rd";
export type Role = "institute_admin" | "teacher" | "student" | "parent";

export interface Person { userId: string; email: string; role: Role; membershipId: string; profileId?: string; instituteId: string }
export interface Fixture {
  institute: { id: string; slug: string; name: string };
  admin: Person; teacher: Person; student: Person; parent: Person;
  batchId: string; otherBatchId: string;
}

export interface Harness {
  app: NestExpressApplication;
  db: Db;
  env: Env;
  handle: DbHandle;
  http: () => ReturnType<typeof request>;
  createInstitute(slug: string, status?: InstituteStatus): Promise<Fixture>;
  createSuperAdmin(email?: string): Promise<Person>;
  login(email: string, password?: string): Promise<string>;
  /** supertest helpers carrying the session cookie (and optional institute header) */
  as(cookie: string, instituteId?: string): {
    get(path: string): request.Test; post(path: string, body?: any): request.Test;
    patch(path: string, body?: any): request.Test; delete(path: string): request.Test;
  };
  close(): Promise<void>;
}

export async function bootHarness(): Promise<Harness> {
  const handle = await createTestDb();
  const env = loadEnv({ NODE_ENV: "test", BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret", QUEUE_DRIVER: "inline" });
  const app = await createApp({ handle, env });
  await app.init();
  const db = app.get<Db>(DB_SYSTEM);
  const auth: any = app.get(AUTH);
  const passwordHash: string = await (await auth.$context).password.hash(PASSWORD);
  const server = app.getHttpServer();

  async function addUser(email: string, name: string, role?: string) {
    const [u] = await db.insert(users).values({ email, name, emailVerified: true, role: role ?? null }).returning({ id: users.id });
    await db.insert(accounts).values({ accountId: u!.id, providerId: "credential", userId: u!.id, password: passwordHash });
    return u!.id;
  }

  async function addPerson(instituteId: string, email: string, role: Role, name = email.split("@")[0]!): Promise<Person> {
    const userId = await addUser(email, name);
    const [m] = await db.insert(memberships).values({ organizationId: instituteId, userId, role }).returning({ id: memberships.id });
    return { userId, email, role, membershipId: m!.id, instituteId };
  }

  const h: Harness = {
    app, db, env, handle,
    http: () => request(server),

    async createInstitute(slug, status = "approved") {
      const [inst] = await db.insert(institutes).values({ name: `Institute ${slug}`, slug, status }).returning();
      const id = inst!.id;
      const admin = await addPerson(id, `admin@${slug}.test`, "institute_admin");
      const teacher = await addPerson(id, `teacher@${slug}.test`, "teacher");
      const student = await addPerson(id, `student@${slug}.test`, "student");
      const parent = await addPerson(id, `parent@${slug}.test`, "parent");
      const [b1] = await db.insert(batches).values({ instituteId: id, name: `${slug}-batch-1`, year: 2026 }).returning({ id: batches.id });
      const [b2] = await db.insert(batches).values({ instituteId: id, name: `${slug}-batch-2`, year: 2026 }).returning({ id: batches.id });
      const [t] = await db.insert(teachers).values({ instituteId: id, membershipId: teacher.membershipId, userId: teacher.userId }).returning({ id: teachers.id });
      const [s] = await db.insert(students).values({ instituteId: id, membershipId: student.membershipId, userId: student.userId, rollNo: `${slug}-R1` }).returning({ id: students.id });
      const [g] = await db.insert(guardians).values({ instituteId: id, membershipId: parent.membershipId, userId: parent.userId }).returning({ id: guardians.id });
      await db.insert(batchTeachers).values({ instituteId: id, batchId: b1!.id, teacherId: t!.id });
      await db.insert(enrolments).values({ instituteId: id, batchId: b1!.id, studentId: s!.id });
      await db.insert(guardianStudentLinks).values({ instituteId: id, guardianId: g!.id, studentId: s!.id, status: "verified" });
      teacher.profileId = t!.id; student.profileId = s!.id; parent.profileId = g!.id;
      return { institute: { id, slug, name: inst!.name }, admin, teacher, student, parent, batchId: b1!.id, otherBatchId: b2!.id };
    },

    async createSuperAdmin(email = "owner@platform.test") {
      const userId = await addUser(email, "Platform Owner", "super_admin");
      return { userId, email, role: "institute_admin" as Role, membershipId: "", instituteId: "" };
    },

    async login(email, password = PASSWORD) {
      const res = await request(server).post("/api/v1/auth/sign-in/email").set("Origin", env.WEB_ORIGIN).send({ email, password });
      if (res.status >= 400) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
      const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]);
      if (!cookies.length) throw new Error("no session cookie");
      return cookies.join("; ");
    },

    as(cookie, instituteId) {
      const wrap = (t: request.Test) => {
        t.set("Cookie", cookie).set("Origin", env.WEB_ORIGIN);
        if (instituteId) t.set("x-institute-id", instituteId);
        return t;
      };
      return {
        get: (p) => wrap(request(server).get(p)),
        post: (p, b) => wrap(request(server).post(p)).send(b ?? {}),
        patch: (p, b) => wrap(request(server).patch(p)).send(b ?? {}),
        delete: (p) => wrap(request(server).delete(p)),
      };
    },

    async close() {
      await app.close();
    },
  };
  return h;
}

export interface RouteInfo { method: string; path: string; key: string }

/** Every route registered by every controller, as "METHOD /api/v1/path/:param". */
export function listRoutes(app: NestExpressApplication): RouteInfo[] {
  const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL", "OPTIONS", "HEAD"];
  const out: RouteInfo[] = [];
  const container = app.get(ModulesContainer);
  for (const mod of container.values()) {
    for (const wrapper of mod.controllers.values()) {
      const cls = wrapper.metatype as any;
      if (!cls) continue;
      const base = Reflect.getMetadata("path", cls) ?? "";
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        const fn = cls.prototype[name];
        if (typeof fn !== "function" || name === "constructor") continue;
        const m = Reflect.getMetadata("method", fn);
        if (m === undefined) continue;
        const sub = Reflect.getMetadata("path", fn) ?? "";
        const path = ("/" + [base, sub].join("/")).replace(/\/+/g, "/").replace(/\/$/, "") || "/";
        const method = METHODS[m] ?? String(m);
        out.push({ method, path, key: `${method} ${path}` });
      }
    }
  }
  return out;
}


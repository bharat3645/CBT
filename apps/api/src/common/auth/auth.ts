import { betterAuth, APIError } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { accounts, institutes, invitations, memberships, sessions, users, verifications, type Db } from "@cbt/db";
import type { Env } from "@cbt/config";
import type { Notifier } from "../adapters/notifier";

/**
 * Better Auth with organization === institute. Passwords are Argon2id (SRS 17).
 * Sessions are cookie based; the web app and API share the site. Institute roles live on `memberships`,
 * the platform owner is users.role = 'super_admin' (plain column; the admin plugin is intentionally not used).
 */
export function createAuth(db: Db, env: Env, notifier: Notifier) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/v1/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db as any, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        organization: institutes,
        member: memberships,
        invitation: invitations,
      },
    }),
    advanced: { database: { generateId: "uuid" } },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: 60 * 30,
      password: {
        hash: (password: string) => argonHash(password),
        verify: ({ hash, password }: { hash: string; password: string }) => argonVerify(hash, password),
      },
      sendResetPassword: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
        await notifier.send({ to: user.email, template: "password-reset", data: { name: user.name, url } });
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: env.NODE_ENV === "production",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/sign-up/email": { window: 60, max: 10 },
      },
    },
    plugins: [
      organization({ allowUserToCreateOrganization: false }),
    ],
    databaseHooks: {
      session: {
        create: {
          before: async (session: any) => {
            const activeInstituteId = await assertCanLogin(db, session.userId);
            return { data: { ...session, activeOrganizationId: activeInstituteId ?? null } };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * FR-002: suspended/deactivated institutes cannot log in. A user whose every active membership is in a
 * suspended/deactivated institute is rejected. Pending institutes may log in (the guard blocks data access).
 * Returns the single institute to activate when there is exactly one.
 */
async function assertCanLogin(db: Db, userId: string): Promise<string | undefined> {
  const [u] = await db.select({ status: users.status, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return undefined;
  if (u.status !== "active") throw new APIError("FORBIDDEN", { message: "Account is disabled" });
  if (u.role === "super_admin") return undefined;
  const rows = await db
    .select({ id: institutes.id, status: institutes.status })
    .from(memberships)
    .innerJoin(institutes, eq(institutes.id, memberships.organizationId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")));
  if (rows.length > 0 && rows.every((r) => r.status === "suspended" || r.status === "deactivated")) {
    throw new APIError("FORBIDDEN", { message: "Your institute is not active. Contact support." });
  }
  const usable = rows.filter((r) => r.status === "approved" || r.status === "pending");
  return usable.length === 1 ? usable[0]!.id : undefined;
}

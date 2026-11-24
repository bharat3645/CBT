import { z } from "zod";

/** Single source of truth for process env. Every app calls loadEnv() once at boot. */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  /** Superuser/owner connection: migrations, Better Auth, system work. */
  DATABASE_URL: z.string().default("postgres://cbt:cbt@localhost:5432/cbt"),
  VALKEY_URL: z.string().default("redis://localhost:6379"),
  /** Better Auth */
  BETTER_AUTH_SECRET: z.string().min(16).default("dev-only-secret-change-me-please-0000"),
  BETTER_AUTH_URL: z.string().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  /** Comma separated emails that are promoted to super_admin by the seed. */
  SUPER_ADMIN_EMAIL: z.string().default("owner@cbt.local"),
  SUPER_ADMIN_PASSWORD: z.string().default("ChangeMe!12345"),
  /** Object storage (S3 API, SeaweedFS in dev) */
  S3_ENDPOINT: z.string().default("http://localhost:8333"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("cbt"),
  S3_ACCESS_KEY: z.string().default("any"),
  S3_SECRET_KEY: z.string().default("any"),
  GOTENBERG_URL: z.string().default("http://localhost:3100"),
  /** "inline" runs jobs in-process (dev/tests); "bullmq" enqueues to Valkey for apps/worker. */
  QUEUE_DRIVER: z.enum(["inline", "bullmq"]).default("inline"),
  SMTP_URL: z.string().default("smtp://localhost:1025"),
});
export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error("Invalid environment: " + JSON.stringify(parsed.error.flatten().fieldErrors));
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.BETTER_AUTH_SECRET.startsWith("dev-only")) {
    throw new Error("BETTER_AUTH_SECRET must be set in production");
  }
  return parsed.data;
}

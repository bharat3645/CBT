import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";
import express from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import type { DbModuleOptions } from "./common/db/db.module";
import { AUTH } from "./common/auth/auth.module";
import { ENV } from "./common/db/db.module";
import type { Env } from "@cbt/config";

/** Shared by main.ts and the test harness. Better Auth owns /api/v1/auth/*; it must see the raw body, so it is mounted before body parsers. */
export async function createApp(db: DbModuleOptions = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(db), { bodyParser: false, logger: ["error", "warn", "log"] });
  const env = app.get<Env>(ENV);
  app.use(helmet());
  app.enableCors({ origin: [env.WEB_ORIGIN], credentials: true });
  app.getHttpAdapter().getInstance().all("/api/v1/auth/*splat", toNodeHandler(app.get(AUTH)));
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.enableShutdownHooks();
  return app;
}

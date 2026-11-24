import { Global, Module } from "@nestjs/common";
import type { Env } from "@cbt/config";
import type { Db } from "@cbt/db";
import { DB_SYSTEM, ENV } from "../db/db.module";
import { Notifier } from "../adapters/notifier";
import { createAuth } from "./auth";

export const AUTH = "AUTH";

@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      inject: [DB_SYSTEM, ENV, Notifier],
      useFactory: (db: Db, env: Env, notifier: Notifier) => createAuth(db, env, notifier),
    },
  ],
  exports: [AUTH],
})
export class AuthModule {}

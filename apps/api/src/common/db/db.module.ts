import { Global, Inject, Injectable, Module, type OnApplicationShutdown, type Provider } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { createDb, type Db, type DbHandle } from "@cbt/db";
import { loadEnv, type Env } from "@cbt/config";
import { currentStore } from "../request-context";

export const ENV = "ENV";
/** Owner/system connection. Bypasses RLS: only for auth, registration, background work. */
export const DB_SYSTEM = "DB_SYSTEM";
/**
 * Request-aware Drizzle. Inside an authenticated request every call transparently goes to that request's
 * RLS-bound transaction (tenant context applied, role cbt_app). Outside a request it falls back to the system db.
 */
export const DB = "DB";
export const DB_HANDLE = "DB_HANDLE";

/**
 * Aliases other modules already inject. To expose the tenant-aware db under another token, append its string here.
 */
export const DB_ALIAS_TOKENS = ["DRIZZLE", "EXAMS_DB", "RESULTS_DB"];

export function tenantAwareDb(system: Db): Db {
  return new Proxy(system as object, {
    get(_t, prop) {
      const target: any = currentStore()?.tx ?? system;
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    },
  }) as Db;
}

/**
 * Elevated (owner) access for the few things tenant code must not do itself: creating global users, reading a user's
 * memberships across institutes. Inside a request it temporarily leaves the RLS role INSIDE the request transaction
 * (so it commits/rolls back with the request and never needs a second connection); outside a request it uses the
 * system connection. Keep fn tiny and never pass client-controlled SQL.
 */
@Injectable()
export class SystemAccess {
  constructor(@Inject(DB_SYSTEM) private readonly sys: Db) {}
  async run<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    const store = currentStore();
    if (!store) return fn(this.sys);
    await store.tx.execute(sql`RESET ROLE`);
    try {
      return await fn(store.tx);
    } finally {
      try {
        await store.tx.execute(sql`SET LOCAL ROLE cbt_app`);
      } catch {
        /* transaction already aborted: the enclosing rollback restores the role */
      }
    }
  }
}

@Injectable()
class DbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly h: DbHandle) {}
  async onApplicationShutdown() {
    await this.h.close();
  }
}

export interface DbModuleOptions {
  /** Tests inject a PGlite handle here. */
  handle?: DbHandle;
  env?: Env;
}

@Global()
@Module({})
export class DbModule {
  static forRoot(opts: DbModuleOptions = {}) {
    const providers: Provider[] = [
      { provide: ENV, useValue: opts.env ?? loadEnv() },
      {
        provide: DB_HANDLE,
        inject: [ENV],
        useFactory: (env: Env) => opts.handle ?? createDb(env.DATABASE_URL),
      },
      { provide: DB_SYSTEM, inject: [DB_HANDLE], useFactory: (h: DbHandle) => h.db },
      { provide: DB, inject: [DB_SYSTEM], useFactory: (sys: Db) => tenantAwareDb(sys) },
      ...DB_ALIAS_TOKENS.map((token) => ({ provide: token, useExisting: DB }) as Provider),
      SystemAccess,
      DbLifecycle,
    ];
    return {
      module: DbModule,
      providers,
      exports: [ENV, DB_HANDLE, DB_SYSTEM, DB, SystemAccess, ...DB_ALIAS_TOKENS],
    };
  }
}

import { Logger } from "@nestjs/common";
import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, lastValueFrom } from "rxjs";
import { applyTenantContext, type Db } from "@cbt/db";
import { DB_SYSTEM } from "./db.module";
import { requestStore, type RequestCtx } from "../request-context";

/**
 * Wraps every authenticated request in ONE transaction bound to the caller's tenant (RLS) and stores it in
 * AsyncLocalStorage, so any service using the injected `DB` automatically runs under RLS.
 * A thrown HttpException rolls the whole request back. Public routes (no req.ctx) run without a transaction.
 */
@Injectable()
export class TenantTxInterceptor implements NestInterceptor {
  private readonly log = new Logger("TenantTx");
  constructor(@Inject(DB_SYSTEM) private readonly system: Db) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx: RequestCtx | undefined = context.switchToHttp().getRequest().ctx;
    if (!ctx) return next.handle();
    return new Observable((subscriber) => {
      const store = { ctx, tx: undefined as unknown as Db, afterCommit: [] as (() => Promise<void>)[] };
      this.system
        .transaction(async (tx) => {
          const t = tx as unknown as Db;
          store.tx = t;
          await applyTenantContext(t, { instituteId: ctx.instituteId, userId: ctx.userId, role: ctx.role, isSuperAdmin: ctx.isSuperAdmin });
          return requestStore.run(store, () => lastValueFrom(next.handle(), { defaultValue: undefined }));
        })
        .then(
          async (v) => {
            for (const job of store.afterCommit) {
              try {
                await job();
              } catch (e) {
                this.log.error(`afterCommit failed: ${e instanceof Error ? e.message : e}`);
              }
            }
            subscriber.next(v);
            subscriber.complete();
          },
          (e) => subscriber.error(e),
        );
    });
  }
}

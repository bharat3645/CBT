import { Module, type DynamicModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { DbModule, type DbModuleOptions } from "./common/db/db.module";
import { TenantTxInterceptor } from "./common/db/tenant.interceptor";
import { AdaptersModule } from "./common/adapters/adapters.module";
import { AuthModule } from "./common/auth/auth.module";
import { AuthGuard, PoliciesGuard } from "./common/auth/auth.guard";
import { AuditModule } from "./common/audit/audit.module";
import { AllExceptionsFilter } from "./common/http-exceptions.filter";
import { HealthController } from "./health.controller";
import { FEATURE_MODULES } from "./modules";

/**
 * Guard order matters: throttle -> authenticate (builds ctx + ability) -> policy check (@Can).
 * TenantTxInterceptor then wraps the handler in the caller's RLS transaction.
 * Add features in ./modules/index.ts, not here.
 */
@Module({})
export class AppModule {
  static forRoot(db: DbModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
        DbModule.forRoot(db),
        AdaptersModule,
        AuthModule,
        AuditModule,
        ...FEATURE_MODULES,
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PoliciesGuard },
        { provide: APP_INTERCEPTOR, useClass: TenantTxInterceptor },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    };
  }
}

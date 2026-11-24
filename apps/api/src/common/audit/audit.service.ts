import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Db } from "@cbt/db";
import { DB } from "../db/db.module";

/**
 * Row-change audit is automatic (DB triggers on AUDITED_TABLES in @cbt/db). Use record() for events that are not a
 * row change: exports, answer-key reads, impersonation, result re-evaluation, logins. Insert-only by design.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async record(action: string, entity: string, entityId?: string | null, meta?: Record<string, unknown>) {
    await this.db.execute(
      sql`SELECT app_audit_event(${action}, ${entity}, ${entityId ?? null}, ${meta ? JSON.stringify(meta) : null}::jsonb)`,
    );
  }
}

import { Controller, Get, Inject, Query } from "@nestjs/common";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { auditLog, type Db } from "@cbt/db";
import { DB } from "../db/db.module";
import { Can, Ctx } from "../auth/decorators";
import type { RequestCtx } from "../request-context";

const q = z.object({
  entity: z.string().optional(),
  entityId: z.string().optional(),
  instituteId: z.string().uuid().optional(),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

@Controller("api/v1/audit-logs")
export class AuditController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** RLS scopes this: institute admins see their institute; the super admin sees everything. */
  @Get()
  @Can("read", "AuditLog")
  async list(@Query() raw: unknown, @Ctx() ctx: RequestCtx) {
    const f = q.parse(raw);
    const conds = [
      f.entity ? eq(auditLog.entity, f.entity) : undefined,
      f.entityId ? eq(auditLog.entityId, f.entityId) : undefined,
      f.instituteId && ctx.isSuperAdmin ? eq(auditLog.instituteId, f.instituteId) : undefined,
      f.before ? lt(auditLog.createdAt, f.before) : undefined,
    ].filter(Boolean) as any[];
    return this.db.select().from(auditLog).where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(auditLog.createdAt)).limit(f.limit);
  }
}

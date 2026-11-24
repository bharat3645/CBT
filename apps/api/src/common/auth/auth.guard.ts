import {
  CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { and, eq } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import { defineAbilityFor, type Role } from "@cbt/abilities";
import {
  batchTeachers, enrolments, guardianStudentLinks, guardians, institutes, memberships, students, teachers, users,
  type Db,
} from "@cbt/db";
import { DB_SYSTEM } from "../db/db.module";
import { AUTH } from "./auth.module";
import type { Auth } from "./auth";
import { ABILITY_KEY, IS_PUBLIC } from "./decorators";
import type { RequestCtx } from "../request-context";

/**
 * Resolves session -> user -> (institute, role, batch/child scope) and builds the CASL ability.
 * Institute comes from the session's active institute, or the x-institute-id header IF the user is a member.
 * Client-sent ids are never trusted beyond that membership check.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DB_SYSTEM) private readonly db: Db,
  ) {}

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ec.getHandler(), ec.getClass()])) return true;
    const req = ec.switchToHttp().getRequest();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) throw new UnauthorizedException();

    const [u] = await this.db.select({ status: users.status, role: users.role, name: users.name, email: users.email })
      .from(users).where(eq(users.id, session.user.id)).limit(1);
    if (!u || u.status !== "active") throw new UnauthorizedException();

    const ctx = u.role === "super_admin" ? this.superCtx(session.user.id, u) : await this.tenantCtx(req, session, u);
    req.ctx = ctx;
    req.session = session;
    req.user = { id: ctx.userId, email: ctx.email, name: ctx.name };
    req.instituteId = ctx.instituteId;
    req.actor = { id: ctx.userId, instituteId: ctx.instituteId, role: ctx.role };
    return true;
  }

  private superCtx(userId: string, u: { name: string; email: string }): RequestCtx {
    return {
      userId, email: u.email, name: u.name, role: "super_admin", instituteId: null, membershipId: null,
      isSuperAdmin: true, batchIds: [], childStudentIds: [],
      ability: defineAbilityFor({ userId, role: "super_admin", instituteId: null }),
    };
  }

  private async tenantCtx(req: any, session: any, u: { name: string; email: string }): Promise<RequestCtx> {
    const userId: string = session.user.id;
    const rows = await this.db
      .select({ m: memberships, inst: institutes })
      .from(memberships)
      .innerJoin(institutes, eq(institutes.id, memberships.organizationId))
      .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")));
    if (rows.length === 0) throw new ForbiddenException("No institute membership");

    const requested: string | undefined = (req.headers["x-institute-id"] as string | undefined) ?? session.session.activeOrganizationId ?? undefined;
    let chosen = requested ? rows.find((r) => r.inst.id === requested) : rows.length === 1 ? rows[0] : undefined;
    if (!chosen && requested) throw new ForbiddenException("Not a member of that institute");
    if (!chosen) throw new ForbiddenException("Select an institute (x-institute-id header or set active institute)");
    if (chosen.inst.status !== "approved") {
      throw new ForbiddenException({ message: `Institute is ${chosen.inst.status}`, code: `INSTITUTE_${chosen.inst.status.toUpperCase()}` });
    }

    const role = chosen.m.role as Role;
    const instituteId = chosen.inst.id;
    let batchIds: string[] = [];
    let studentId: string | undefined;
    let childStudentIds: string[] = [];

    if (role === "teacher") {
      const r = await this.db.select({ batchId: batchTeachers.batchId }).from(batchTeachers)
        .innerJoin(teachers, eq(teachers.id, batchTeachers.teacherId)).where(eq(teachers.membershipId, chosen.m.id));
      batchIds = r.map((x) => x.batchId);
    } else if (role === "student") {
      const [s] = await this.db.select({ id: students.id }).from(students).where(eq(students.membershipId, chosen.m.id)).limit(1);
      studentId = s?.id;
      if (studentId) {
        const r = await this.db.select({ batchId: enrolments.batchId }).from(enrolments).where(eq(enrolments.studentId, studentId));
        batchIds = r.map((x) => x.batchId);
      }
    } else if (role === "parent") {
      const r = await this.db.select({ sid: guardianStudentLinks.studentId }).from(guardianStudentLinks)
        .innerJoin(guardians, eq(guardians.id, guardianStudentLinks.guardianId))
        .where(and(eq(guardians.membershipId, chosen.m.id), eq(guardianStudentLinks.status, "verified")));
      childStudentIds = r.map((x) => x.sid);
    }

    return {
      userId, email: u.email, name: u.name, role, instituteId, membershipId: chosen.m.id, isSuperAdmin: false,
      batchIds, studentId, childStudentIds,
      ability: defineAbilityFor({ userId, role, instituteId, batchIds, studentId, childStudentIds }),
    };
  }
}

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ec: ExecutionContext): boolean {
    const need = this.reflector.getAllAndOverride<{ action: any; subject: any }>(ABILITY_KEY, [ec.getHandler(), ec.getClass()]);
    if (!need) return true;
    const ctx: RequestCtx | undefined = ec.switchToHttp().getRequest().ctx;
    if (!ctx || !ctx.ability.can(need.action, need.subject)) throw new ForbiddenException();
    return true;
  }
}

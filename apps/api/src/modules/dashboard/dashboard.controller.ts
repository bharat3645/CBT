import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import { Ctx } from "../../common/auth/decorators";
import type { RequestCtx } from "../../common/request-context";
import { DashboardService } from "./dashboard.service";

const dashboardQuery = z.object({ childId: z.string().uuid().optional() });

/** Role-aware aggregates for the dashboards and sidebar badges. Everything is scoped by the caller's own context. */
@Controller("api/v1")
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  /** Admin / teacher / student / parent each get their own shape (see @cbt/contracts/dashboard). Parents may pass ?childId. */
  @Get("dashboard")
  dashboard(@Ctx() ctx: RequestCtx, @Query() q: unknown) {
    return this.svc.get(ctx, dashboardQuery.parse(q).childId);
  }

  /** A parent's verified linked children (the child switcher). Empty for every other role. */
  @Get("children")
  children(@Ctx() ctx: RequestCtx) {
    return this.svc.children(ctx);
  }
}

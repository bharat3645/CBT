import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Can, Ctx, Public } from "../../common/auth/decorators";
import type { RequestCtx } from "../../common/request-context";
import { IdentityService, registerInstituteInput, updateInstituteInput } from "./identity.service";

@Controller("api/v1")
export class IdentityController {
  constructor(private readonly svc: IdentityService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("institutes")
  register(@Body() body: unknown) {
    return this.svc.register(registerInstituteInput.parse(body));
  }

  @Get("me")
  me(@Ctx() ctx: RequestCtx) {
    return this.svc.me(ctx);
  }

  // ---- super admin ----
  @Get("institutes")
  @Can("approve", "Institute")
  list(@Query("status") status?: string) {
    return this.svc.list(status);
  }

  @Get("institutes/:id")
  @Can("approve", "Institute")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.svc.get(id);
  }

  @Post("institutes/:id/approve")
  @HttpCode(200)
  @Can("approve", "Institute")
  approve(@Ctx() ctx: RequestCtx, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.setStatus(ctx, id, "approved");
  }

  @Post("institutes/:id/suspend")
  @HttpCode(200)
  @Can("suspend", "Institute")
  suspend(@Ctx() ctx: RequestCtx, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.setStatus(ctx, id, "suspended");
  }

  @Post("institutes/:id/reactivate")
  @HttpCode(200)
  @Can("approve", "Institute")
  reactivate(@Ctx() ctx: RequestCtx, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.setStatus(ctx, id, "approved");
  }

  @Post("institutes/:id/deactivate")
  @HttpCode(200)
  @Can("suspend", "Institute")
  deactivate(@Ctx() ctx: RequestCtx, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.setStatus(ctx, id, "deactivated");
  }

  // ---- institute admin: own institute / branding (FR-006) ----
  @Get("institute")
  @Can("read", "Institute")
  own(@Ctx() ctx: RequestCtx) {
    return this.svc.get(ctx.instituteId!);
  }

  @Patch("institute")
  @Can("update", "Institute")
  updateOwn(@Ctx() ctx: RequestCtx, @Body() body: unknown) {
    return this.svc.updateOwn(ctx, updateInstituteInput.parse(body));
  }
}

import { Body, Controller, Get, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { Ctx } from "../../common/auth/decorators";
import type { RequestCtx } from "../../common/request-context";
import { Phase2Service, attendanceInput, checkInput, feedbackInput } from "./phase2.service";

@Controller("api/v1")
export class Phase2Controller {
  constructor(private readonly svc: Phase2Service) {}

  @Get("attendance/roster") roster(@Ctx() c: RequestCtx, @Query("batchId", ParseUUIDPipe) batchId: string, @Query("date") date: string) {
    return this.svc.roster(c, batchId, /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date : new Date().toISOString().slice(0, 10));
  }
  @Put("attendance") mark(@Ctx() c: RequestCtx, @Body() b: unknown) { return this.svc.mark(c, attendanceInput.parse(b)); }
  @Get("attendance/summary") summary(@Ctx() c: RequestCtx, @Query("studentUserId") s?: string) { return this.svc.summary(c, s); }

  @Get("feedback") feedback(@Ctx() c: RequestCtx, @Query("studentUserId") s?: string) { return this.svc.listFeedback(c, s); }
  @Post("feedback") addFeedback(@Ctx() c: RequestCtx, @Body() b: unknown) { return this.svc.addFeedback(c, feedbackInput.parse(b)); }
  @Get("feedback/students") students(@Ctx() c: RequestCtx) { return this.svc.students(c); }

  @Get("practice/topics") topics(@Ctx() c: RequestCtx) { return this.svc.practiceTopics(c); }
  @Get("practice/set") set(@Ctx() c: RequestCtx, @Query("topicId") t?: string, @Query("count") n?: string) { return this.svc.practiceSet(c, t, Number(n)); }
  @Post("practice/check") check(@Ctx() c: RequestCtx, @Body() b: unknown) { return this.svc.practiceCheck(c, checkInput.parse(b)); }
  @Get("practice/stats") stats(@Ctx() c: RequestCtx) { return this.svc.practiceStats(c); }
}

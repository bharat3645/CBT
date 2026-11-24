import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, BadRequestException, ForbiddenException } from "@nestjs/common";
import { createTestInput, autosaveInput, incidentInput } from "@cbt/contracts/exams";
import { Can } from "../../common/auth/decorators";
import { ExamsService, type Actor } from "./exams.service";

// Core's auth guard sets req.actor = { id, instituteId, role } and req.ctx (batch scope). Never client-supplied.
const actor = (req: any): Actor => {
  if (!req.actor) throw new BadRequestException("No actor");
  return { ...req.actor, batchIds: req.ctx?.batchIds };
};

// Institute admins hold "manage" on Test (which includes "take"), so taking a test is additionally limited to students.
const studentActor = (req: any): Actor => {
  const a = actor(req);
  if (a.role !== "student") throw new ForbiddenException("Students only");
  return a;
};

@Controller("api/v1")
export class ExamsController {
  constructor(private readonly svc: ExamsService) {}

  @Get("exam-presets") presets() { return this.svc.listPresets(); }

  /** Staff: tests of the institute (admin) or of the teacher's batches, with status, window, batches, attempt counts. */
  @Get("tests") @Can("schedule", "Test")
  list(@Req() req: any) { return this.svc.listTests(actor(req)); }

  /** Student: published tests for the student's enrolled batches with the student's own attempt state. */
  @Get("tests/upcoming") @Can("take", "Test")
  upcoming(@Req() req: any) { return this.svc.listUpcoming(studentActor(req)); }

  @Post("tests") @Can("create", "Test")
  create(@Req() req: any, @Body() body: unknown) {
    return this.svc.createTest(actor(req), createTestInput.parse(body));
  }
  @Post("tests/:id/publish") @Can("schedule", "Test")
  publish(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.publishTest(actor(req), id);
  }
  @Post("tests/:id/attempts") @Can("take", "Test")
  start(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.startAttempt(studentActor(req), id);
  }
  @Get("attempts/:id/questions") questions(@Req() req: any, @Param("id") id: string) {
    return this.svc.getAttemptQuestions(actor(req), id);
  }
  @Post("attempts/:id/answers") autosave(@Req() req: any, @Param("id") id: string, @Body() body: unknown) {
    return this.svc.autosave(actor(req), id, autosaveInput.parse(body).items);
  }
  @Post("attempts/:id/incidents") incident(@Req() req: any, @Param("id") id: string, @Body() body: unknown) {
    return this.svc.logIncident(actor(req), id, incidentInput.parse(body));
  }
  @Post("attempts/:id/submit") submit(@Req() req: any, @Param("id") id: string) {
    return this.svc.submit(actor(req), id);
  }
}

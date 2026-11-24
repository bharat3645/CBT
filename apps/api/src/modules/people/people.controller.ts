import {
  BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { Can, Ctx } from "../../common/auth/decorators";
import type { RequestCtx } from "../../common/request-context";
import { PeopleService } from "./people.service";
import { BatchesService } from "./batches.service";
import { ImportService } from "./import.service";
import { createPersonInput } from "./people.schemas";

const uuidList = z.array(z.string().uuid()).min(1).max(1000);
const studentIdsBody = z.object({ studentIds: uuidList });
const teacherIdsBody = z.object({ teacherIds: uuidList, subject: z.string().max(100).optional() });

@Controller("api/v1")
export class PeopleController {
  constructor(
    private readonly people: PeopleService,
    private readonly batches: BatchesService,
    private readonly imports: ImportService,
  ) {}

  // ---------------- users ----------------
  @Get("users")
  @Can("read", "User")
  list(@Ctx() ctx: RequestCtx, @Query() q: unknown) {
    return this.people.list(ctx, q);
  }

  @Post("users")
  @Can("create", "User")
  create(@Ctx() ctx: RequestCtx, @Body() body: unknown) {
    return this.people.create(ctx, createPersonInput.parse(body));
  }

  @Get("users/:id")
  @Can("read", "User")
  get(@Ctx() ctx: RequestCtx, @Param("id", ParseUUIDPipe) id: string) {
    return this.people.get(ctx, id);
  }

  @Patch("users/:id")
  @Can("update", "User")
  update(@Ctx() ctx: RequestCtx, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.people.update(ctx, id, body);
  }

  @Delete("users/:id")
  @Can("delete", "User")
  remove(@Ctx() ctx: RequestCtx, @Param("id", ParseUUIDPipe) id: string) {
    return this.people.remove(ctx, id);
  }

  // ---------------- guardian links ----------------
  @Get("guardian-links")
  @Can("read", "GuardianLink")
  linkList(@Query() q: unknown) {
    return this.people.links(q);
  }

  @Post("guardian-links")
  @Can("create", "GuardianLink")
  link(@Ctx() ctx: RequestCtx, @Body() body: unknown) {
    const b = z.object({ guardianId: z.string().uuid(), studentId: z.string().uuid() }).parse(body);
    return this.people.link(b.guardianId, b.studentId, ctx);
  }

  @Delete("guardian-links/:guardianId/:studentId")
  @Can("delete", "GuardianLink")
  unlink(@Param("guardianId", ParseUUIDPipe) g: string, @Param("studentId", ParseUUIDPipe) s: string) {
    return this.people.unlink(g, s);
  }

  // ---------------- batches ----------------
  @Get("batches")
  @Can("read", "Batch")
  batchList(@Ctx() ctx: RequestCtx) {
    return this.batches.list(ctx);
  }

  @Post("batches")
  @Can("create", "Batch")
  batchCreate(@Ctx() ctx: RequestCtx, @Body() body: unknown) {
    return this.batches.create(ctx, body);
  }

  @Get("batches/:id")
  @Can("read", "Batch")
  batchGet(@Ctx() ctx: RequestCtx, @Param("id", ParseUUIDPipe) id: string) {
    return this.batches.get(ctx, id);
  }

  @Patch("batches/:id")
  @Can("update", "Batch")
  batchUpdate(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.batches.update(id, body);
  }

  @Delete("batches/:id")
  @Can("delete", "Batch")
  batchRemove(@Param("id", ParseUUIDPipe) id: string) {
    return this.batches.remove(id);
  }

  @Post("batches/:id/students")
  @Can("update", "Batch")
  enrol(@Ctx() ctx: RequestCtx, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.batches.enrol(ctx, id, studentIdsBody.parse(body).studentIds);
  }

  @Delete("batches/:id/students/:studentId")
  @Can("update", "Batch")
  unenrol(@Param("id", ParseUUIDPipe) id: string, @Param("studentId", ParseUUIDPipe) sid: string) {
    return this.batches.unenrol(id, sid);
  }

  @Post("batches/:id/teachers")
  @Can("update", "Batch")
  assign(@Ctx() ctx: RequestCtx, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const b = teacherIdsBody.parse(body);
    return this.batches.assignTeachers(ctx, id, b.teacherIds, b.subject);
  }

  @Delete("batches/:id/teachers/:teacherId")
  @Can("update", "Batch")
  unassign(@Param("id", ParseUUIDPipe) id: string, @Param("teacherId", ParseUUIDPipe) tid: string) {
    return this.batches.unassignTeacher(id, tid);
  }

  // ---------------- CSV import ----------------
  @Get("imports/users/template")
  @Header("Content-Type", "text/csv")
  @Can("import", "Import")
  template() {
    return this.imports.template();
  }

  /** multipart (field "file") or JSON { csv, filename }. 200 with per-row errors even when some rows fail. */
  @Post("imports/users")
  @HttpCode(200)
  @Can("import", "Import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  importUsers(@Ctx() ctx: RequestCtx, @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined, @Body() body: any) {
    const csv = file ? file.buffer.toString("utf8") : typeof body?.csv === "string" ? body.csv : undefined;
    if (!csv) throw new BadRequestException("Send a CSV file (field 'file') or JSON { csv }");
    return this.imports.start(ctx, csv, file?.originalname ?? body?.filename);
  }

  @Get("imports/:id")
  @Can("import", "Import")
  importGet(@Param("id", ParseUUIDPipe) id: string) {
    return this.imports.get(id);
  }

  @Get("imports/:id/errors.csv")
  @Header("Content-Type", "text/csv")
  @Can("import", "Import")
  importErrors(@Param("id", ParseUUIDPipe) id: string) {
    return this.imports.errorCsv(id);
  }
}

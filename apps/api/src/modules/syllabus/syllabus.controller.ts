import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { batches, enrolments, type Db } from '@cbt/db';
import { Can, Ctx } from '../../common/auth/decorators';
import { DB } from '../../common/db/db.module';
import type { RequestCtx } from '../../common/request-context';
import { SyllabusService } from './syllabus.service';
import { InstituteId } from '../questions/tenant';

/**
 * Authorisation: the tree and templates are readable by every institute role; structure edits are admin-only
 * (`create`/`update`/`delete` Syllabus); per-batch progress is readable by that batch's teachers, students and parents
 * (parents: only batches their verified children are enrolled in) and writable by the batch's teachers and admins.
 */
@Controller('api/v1/syllabus')
export class SyllabusController {
  constructor(
    private readonly svc: SyllabusService,
    @Inject(DB) private readonly db: Db,
  ) {}

  @Get('tree')
  @Can('read', 'Syllabus')
  tree(@InstituteId() inst: string) {
    return this.svc.tree(inst);
  }

  @Get('templates')
  @Can('read', 'Syllabus')
  templates() {
    return this.svc.templates();
  }

  @Post('templates/copy')
  @Can('create', 'Syllabus')
  copyTemplate(@InstituteId() inst: string, @Body() body: unknown) {
    return this.svc.copyTemplate(inst, body);
  }

  @Post('nodes')
  @Can('create', 'Syllabus')
  create(@InstituteId() inst: string, @Body() body: unknown) {
    return this.svc.createNode(inst, body);
  }

  @Patch('nodes/:id')
  @Can('update', 'Syllabus')
  update(@InstituteId() inst: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.updateNode(inst, id, body);
  }

  @Delete('nodes/:id')
  @Can('delete', 'Syllabus')
  @HttpCode(204)
  remove(@InstituteId() inst: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteNode(inst, id);
  }

  @Post('materials')
  @Can('create', 'Material')
  addMaterial(@InstituteId() inst: string, @Body() body: unknown) {
    return this.svc.addMaterial(inst, body);
  }

  @Get('topics/:topicId/materials')
  @Can('read', 'Material')
  materials(@InstituteId() inst: string, @Param('topicId', ParseUUIDPipe) topicId: string) {
    return this.svc.materials(inst, topicId);
  }

  @Get('batches/:batchId/progress')
  @Can('read', 'Syllabus')
  async progress(@Ctx() ctx: RequestCtx, @InstituteId() inst: string, @Param('batchId', ParseUUIDPipe) batchId: string) {
    await this.assertCanSee(ctx, batchId);
    return this.svc.batchProgress(inst, batchId);
  }

  @Put('batches/:batchId/progress/:topicId')
  @Can('read', 'Syllabus')
  async setProgress(
    @Ctx() ctx: RequestCtx,
    @InstituteId() inst: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Body() body: unknown,
  ) {
    if (ctx.role === 'teacher') {
      if (!ctx.batchIds.includes(batchId)) throw new NotFoundException();
    } else if (ctx.role === 'institute_admin') {
      const [b] = await this.db.select({ id: batches.id }).from(batches).where(eq(batches.id, batchId)).limit(1);
      if (!b) throw new NotFoundException('Batch not found');
    } else {
      throw new ForbiddenException();
    }
    return this.svc.setTopicProgress(inst, batchId, topicId, body);
  }

  /** 404 (never 403) for batches the caller has no business with, so ids are not confirmed. */
  private async assertCanSee(ctx: RequestCtx, batchId: string) {
    if (ctx.role === 'teacher' || ctx.role === 'student') {
      if (!ctx.batchIds.includes(batchId)) throw new NotFoundException();
    } else if (ctx.role === 'parent') {
      const rows = ctx.childStudentIds.length
        ? await this.db.select({ id: enrolments.id }).from(enrolments)
            .where(and(eq(enrolments.batchId, batchId), inArray(enrolments.studentId, ctx.childStudentIds))).limit(1)
        : [];
      if (!rows.length) throw new NotFoundException();
    } else if (ctx.role === 'institute_admin') {
      const [b] = await this.db.select({ id: batches.id }).from(batches).where(eq(batches.id, batchId)).limit(1);
      if (!b) throw new NotFoundException('Batch not found');
    } else {
      throw new ForbiddenException();
    }
  }
}

import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { duplicateCheckSchema, searchQuestionsSchema } from '@cbt/contracts';
import { QuestionsService } from './questions.service';
import { CurrentUserId, InstituteId } from './tenant';
import { Can } from '../../common/auth/decorators';

@Controller('api/v1/questions')
export class QuestionsController {
  constructor(private readonly svc: QuestionsService) {}

  @Get()
  @Can('read', 'Question')
  search(@InstituteId() inst: string, @Query() query: Record<string, unknown>) {
    return this.svc.search(inst, searchQuestionsSchema.parse(query));
  }

  @Post('duplicates')
  @Can('read', 'Question')
  duplicates(@InstituteId() inst: string, @Body() body: unknown) {
    const { stemText, excludeQuestionId } = duplicateCheckSchema.parse(body);
    return this.svc.checkStem(inst, stemText, excludeQuestionId);
  }

  @Post()
  @Can('create', 'Question')
  create(@InstituteId() inst: string, @CurrentUserId() uid: string | null, @Body() body: unknown) {
    return this.svc.create(inst, uid, body);
  }

  @Get(':id')
  @Can('read', 'Question')
  get(@InstituteId() inst: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(inst, id);
  }

  @Get(':id/versions')
  @Can('read', 'Question')
  versions(@InstituteId() inst: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.versions(inst, id);
  }

  @Get(':id/versions/:version')
  @Can('read', 'Question')
  version(
    @InstituteId() inst: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.svc.get(inst, id, version);
  }

  @Put(':id')
  @Can('update', 'Question')
  update(
    @InstituteId() inst: string,
    @CurrentUserId() uid: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(inst, uid, id, body);
  }
}

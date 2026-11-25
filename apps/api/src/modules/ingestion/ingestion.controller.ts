import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IngestionService, MAX_UPLOAD_BYTES } from './ingestion.service';
import { CurrentUserId, InstituteId } from '../questions/tenant';
import { Can } from '../../common/auth/decorators';

@Controller('api/v1/ingestion/papers')
export class IngestionController {
  constructor(private readonly svc: IngestionService) {}

  @Post()
  @Can('create', 'Paper')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @InstituteId() inst: string,
    @CurrentUserId() uid: string | null,
    @UploadedFile() file: { originalname: string; buffer: Buffer },
    @Body('title') title?: string,
  ) {
    return this.svc.upload(inst, uid, file, title);
  }

  @Get()
  @Can('read', 'Paper')
  list(@InstituteId() inst: string) {
    return this.svc.list(inst);
  }

  @Get(':id')
  @Can('read', 'Paper')
  get(@InstituteId() inst: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(inst, id);
  }

  @Patch(':id/drafts/:draftId')
  @Can('update', 'Paper')
  updateDraft(
    @InstituteId() inst: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Body() body: unknown,
  ) {
    return this.svc.updateDraft(inst, id, draftId, body);
  }

  @Put(':id/answer-key')
  @Can('update', 'Paper')
  setAnswerKey(@InstituteId() inst: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.setAnswerKey(inst, id, body);
  }

  /** 422 with { openFlags, missingKey } when the approval gate blocks. */
  @Post(':id/approve')
  @Can('approve', 'Paper')
  approve(@InstituteId() inst: string, @CurrentUserId() uid: string | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.approve(inst, uid, id);
  }
}

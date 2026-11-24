import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { DrizzleQuestionRepository } from './drizzle-questions.repository';
import { QUESTION_REPOSITORY } from './questions.repository';
import { QuestionsService } from './questions.service';

/** Expects a global provider 'DRIZZLE' (core module) yielding a tenant-scoped (RLS) node-postgres Drizzle db. */
@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService, { provide: QUESTION_REPOSITORY, useClass: DrizzleQuestionRepository }],
  exports: [QuestionsService],
})
export class QuestionsModule {}

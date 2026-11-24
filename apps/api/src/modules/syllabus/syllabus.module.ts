import { Module } from '@nestjs/common';
import { DrizzleSyllabusRepository } from './drizzle-syllabus.repository';
import { SyllabusController } from './syllabus.controller';
import { SYLLABUS_REPOSITORY } from './syllabus.repository';
import { SyllabusService } from './syllabus.service';

/** Expects a global provider 'DRIZZLE' (core module). */
@Module({
  controllers: [SyllabusController],
  providers: [SyllabusService, { provide: SYLLABUS_REPOSITORY, useClass: DrizzleSyllabusRepository }],
  exports: [SyllabusService],
})
export class SyllabusModule {}

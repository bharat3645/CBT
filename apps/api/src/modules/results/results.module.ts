import { Module } from '@nestjs/common';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';
import { BullResultsJobs, RESULTS_JOBS } from './results.jobs';
import { GotenbergPdfService, PdfService } from './pdf.service';
import { RESULTS_CLOCK } from './actor';

// Core must provide RESULTS_DB (alias of its Drizzle provider) in the importing module.
// The exam engine imports ResultsModule and calls ResultsJobs.evaluate() after submit.
@Module({
  controllers: [ResultsController],
  providers: [
    ResultsService,
    { provide: RESULTS_JOBS, useClass: BullResultsJobs },
    { provide: PdfService, useClass: GotenbergPdfService },
    { provide: RESULTS_CLOCK, useValue: () => new Date() },
  ],
  exports: [ResultsService, RESULTS_JOBS],
})
export class ResultsModule {}

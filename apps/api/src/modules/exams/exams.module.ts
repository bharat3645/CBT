import { Module } from "@nestjs/common";
import { ExamsController } from "./exams.controller";
import { ResultsModule } from "../results/results.module";
import { ExamsService, EXAMS_CLOCK } from "./exams.service";

// Core must provide EXAMS_DB (alias of its Drizzle provider) in the importing module.
@Module({
  imports: [ResultsModule],
  controllers: [ExamsController],
  providers: [ExamsService, { provide: EXAMS_CLOCK, useValue: () => new Date() }],
  exports: [ExamsService],
})
export class ExamsModule {}

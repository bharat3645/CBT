import { Module } from "@nestjs/common";
import { PeopleController } from "./people.controller";
import { PeopleService } from "./people.service";
import { BatchesService } from "./batches.service";
import { ImportService } from "./import.service";

/** M2: people & batches, enrolment rules, CSV import with per-row errors. */
@Module({
  controllers: [PeopleController],
  providers: [PeopleService, BatchesService, ImportService],
  exports: [PeopleService, BatchesService],
})
export class PeopleModule {}

import { Module } from '@nestjs/common';
import { ClamAvScanner } from './clamav.scanner';
import { DrizzleIngestionRepository } from './drizzle-ingestion.repository';
import { IngestionController } from './ingestion.controller';
import { INGESTION_REPOSITORY } from './ingestion.repository';
import { INGESTION_STORAGE, PARSE_QUEUE, VIRUS_SCANNER } from './ingestion.ports';
import { QueueService } from '../../common/adapters/queue.service';
import { StorageService } from '../../common/adapters/storage.service';
import { IngestionService } from './ingestion.service';

/**
 * Expects global providers from the core module: 'DRIZZLE' (tenant-scoped), INGESTION_STORAGE
 * (SeaweedFS/S3 adapter) and PARSE_QUEUE (BullMQ producer for the `paper-parse` queue).
 * The worker consumes ParsePaperJob, POSTs the original to docparse /parse, validates with
 * docparseResultSchema and calls IngestionRepository.storeParseResult (or markFailed).
 */
@Module({
  controllers: [IngestionController],
  providers: [
    IngestionService,
    { provide: INGESTION_REPOSITORY, useClass: DrizzleIngestionRepository },
    { provide: VIRUS_SCANNER, useClass: ClamAvScanner },
    {
      provide: INGESTION_STORAGE,
      inject: [StorageService],
      useFactory: (s: StorageService) => ({
        put: (key: string, body: Buffer, contentType: string) => s.put(key, body, contentType),
        signedUrl: (key: string, ttl: number) => s.signedDownloadUrl(key, ttl),
      }),
    },
    {
      provide: PARSE_QUEUE,
      inject: [QueueService],
      useFactory: (q: QueueService) => ({
        enqueueParse: (job: { paperId: string; instituteId: string }) =>
          q.enqueue('paper-parse', 'parse', job, { jobId: `parse-${job.paperId}` }),
      }),
    },
  ],
  exports: [IngestionService, INGESTION_REPOSITORY],
})
export class IngestionModule {}

import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { S3StorageService } from "./s3-storage.service";
import { PdfService, GotenbergPdfService } from "./pdf.service";
import { LogNotifier, Notifier } from "./notifier";
import { BullQueueService, QueueService } from "./queue.service";

/** Vendor adapters behind our own interfaces. Override a binding in tests with Test.createTestingModule().overrideProvider(). */
@Global()
@Module({
  providers: [
    { provide: StorageService, useClass: S3StorageService },
    { provide: PdfService, useClass: GotenbergPdfService },
    { provide: Notifier, useClass: LogNotifier },
    { provide: QueueService, useClass: BullQueueService },
  ],
  exports: [StorageService, PdfService, Notifier, QueueService],
})
export class AdaptersModule {}

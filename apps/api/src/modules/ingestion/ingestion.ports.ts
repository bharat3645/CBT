/** Adapter interfaces: business code never imports a vendor SDK directly. */
export const INGESTION_STORAGE = Symbol('INGESTION_STORAGE');
export const VIRUS_SCANNER = Symbol('VIRUS_SCANNER');
export const PARSE_QUEUE = Symbol('PARSE_QUEUE');

export interface IngestionStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Short-lived URL for the review editor's original-document pane. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}

export type ScanResult =
  | { status: 'clean' }
  | { status: 'infected'; signature: string }
  | { status: 'error'; detail: string };

export interface VirusScanner {
  scan(body: Buffer): Promise<ScanResult>;
}

export interface ParseQueue {
  /** Enqueues a BullMQ job on the `paper-parse` queue; the worker calls docparse. */
  enqueueParse(job: { paperId: string; instituteId: string }): Promise<void>;
}

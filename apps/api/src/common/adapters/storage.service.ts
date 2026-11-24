/** Adapter rule: business code depends on this, never on an S3 SDK. */
export abstract class StorageService {
  abstract put(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void>;
  abstract get(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
  /** Short-lived signed GET URL (private buckets only). */
  abstract signedDownloadUrl(key: string, ttlSeconds?: number): Promise<string>;
  /** Short-lived signed PUT URL for direct browser uploads (Uppy). */
  abstract signedUploadUrl(key: string, contentType: string, ttlSeconds?: number): Promise<string>;
}

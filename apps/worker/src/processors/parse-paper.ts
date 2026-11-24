import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { ingestionDrafts, ingestionPapers } from '@cbt/db/schema/ingestion';
import { docparseResultSchema, type DocparseResult, type ParsePaperJob } from '@cbt/contracts/ingestion';

export const PARSE_QUEUE = 'paper-parse';

export interface ParsePaperDeps {
  db: any; // system (RLS-bypassing) Drizzle; every query is still filtered by institute_id
  /** Storage adapter: returns the untouched original. */
  getObject: (key: string) => Promise<Uint8Array>;
  docparseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export type ParseOutcome =
  | { status: 'review'; questions: number }
  | { status: 'failed'; error: string }
  | { status: 'skipped'; reason: string };

/** Non-retryable: retrying cannot change the outcome (bad file, 4xx, malformed response). */
class PermanentError extends Error {}

/** Mirror of IngestionRepository.storeParseResult (apps/api); keep the two in sync. */
export async function storeParseResult(db: any, instituteId: string, paperId: string, result: DocparseResult) {
  await db.transaction(async (tx: any) => {
    await tx.delete(ingestionDrafts).where(and(eq(ingestionDrafts.instituteId, instituteId), eq(ingestionDrafts.paperId, paperId)));
    if (result.questions.length) {
      await tx.insert(ingestionDrafts).values(result.questions.map((q, i) => ({
        instituteId, paperId, number: q.number, ordinal: i, section: q.section, type: q.type, stem: q.stem,
        options: q.options.map((o) => ({ label: o.label, text: o.text })),
        answer: q.answer, confidence: q.confidence, label: q.label,
        flags: q.flags.map((f) => ({ ...f, resolved: false })), source: q.source,
      })));
    }
    await tx.update(ingestionPapers)
      .set({ status: 'review', answerKey: result.answerKey, parseError: null, updatedAt: new Date() })
      .where(and(eq(ingestionPapers.instituteId, instituteId), eq(ingestionPapers.id, paperId)));
  });
}

export async function markFailed(db: any, instituteId: string, paperId: string, error: string) {
  await db.update(ingestionPapers).set({ status: 'failed', parseError: error.slice(0, 1000), updatedAt: new Date() })
    .where(and(eq(ingestionPapers.instituteId, instituteId), eq(ingestionPapers.id, paperId)));
}

/**
 * Parse one paper. Transient failures (network, 5xx) throw so BullMQ retries, unless `isFinalAttempt`;
 * permanent failures and the final attempt mark the paper failed and resolve.
 */
export async function parsePaper(deps: ParsePaperDeps, job: ParsePaperJob, isFinalAttempt = true): Promise<ParseOutcome> {
  const { db } = deps;
  const f = deps.fetch ?? fetch;
  const [paper] = await db.select().from(ingestionPapers)
    .where(and(eq(ingestionPapers.id, job.paperId), eq(ingestionPapers.instituteId, job.instituteId)));
  if (!paper) return { status: 'skipped', reason: 'paper not found' };
  if (paper.status === 'approved') return { status: 'skipped', reason: 'paper already approved' };

  try {
    if (paper.scanStatus === 'infected') throw new PermanentError('File failed the virus scan');
    await db.update(ingestionPapers).set({ status: 'parsing', parseError: null, updatedAt: new Date() })
      .where(and(eq(ingestionPapers.id, paper.id), eq(ingestionPapers.instituteId, job.instituteId)));

    const body = await deps.getObject(paper.storageKey);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(body)], { type: paper.mimeType }), paper.filename);

    const res = await f(`${deps.docparseUrl.replace(/\/$/, '')}/parse`, {
      method: 'POST', body: form, signal: AbortSignal.timeout(deps.timeoutMs ?? 300_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      const msg = `docparse responded ${res.status}${detail ? `: ${detail}` : ''}`;
      throw res.status >= 500 || res.status === 429 ? new Error(msg) : new PermanentError(msg);
    }
    const parsed = docparseResultSchema.safeParse(await res.json());
    if (!parsed.success) throw new PermanentError(`docparse returned an unexpected shape: ${parsed.error.issues[0]?.message}`);

    await storeParseResult(db, job.instituteId, job.paperId, parsed.data);
    return { status: 'review', questions: parsed.data.questions.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof PermanentError || isFinalAttempt) {
      await markFailed(db, job.instituteId, job.paperId, message);
      return { status: 'failed', error: message };
    }
    throw err;
  }
}

export function createParsePaperWorker(connection: ConnectionOptions, deps: ParsePaperDeps) {
  return new Worker<ParsePaperJob>(PARSE_QUEUE, (job: Job<ParsePaperJob>) => {
    const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    return parsePaper(deps, job.data, final);
  }, { connection, concurrency: 2 });
}

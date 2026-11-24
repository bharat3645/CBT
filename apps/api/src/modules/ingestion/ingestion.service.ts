import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  setAnswerKeySchema,
  updateDraftSchema,
  type Draft,
  type PaperDetail,
  type PaperSummary,
} from '@cbt/contracts';
import { buildSearchText } from '../questions/question-logic';
import { draftToPayload } from './promote-draft';
import { effectiveAnswer, evaluateApproval, parseAnswerKeyText } from './approval-gate';
import { INGESTION_REPOSITORY, type IngestionRepository, type PaperRow, type PromoteItem } from './ingestion.repository';
import {
  INGESTION_STORAGE,
  PARSE_QUEUE,
  VIRUS_SCANNER,
  type IngestionStorage,
  type ParseQueue,
  type VirusScanner,
} from './ingestion.ports';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

/** Magic-byte check so a renamed file cannot slip through the extension filter. */
export function sniffKind(name: string, body: Buffer): 'docx' | 'pdf' | null {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'pdf' && body.subarray(0, 5).toString() === '%PDF-') return 'pdf';
  if (ext === 'docx' && body.subarray(0, 2).toString() === 'PK') return 'docx';
  return null;
}

@Injectable()
export class IngestionService {
  constructor(
    @Inject(INGESTION_REPOSITORY) private readonly repo: IngestionRepository,
    @Inject(INGESTION_STORAGE) private readonly storage: IngestionStorage,
    @Inject(VIRUS_SCANNER) private readonly scanner: VirusScanner,
    @Inject(PARSE_QUEUE) private readonly queue: ParseQueue,
  ) {}

  /** Store untouched original -> ClamAV -> enqueue parse. Slow work (docparse) is done by the worker. */
  async upload(
    instituteId: string,
    userId: string | null,
    file: { originalname: string; buffer: Buffer },
    title?: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('File is required');
    if (file.buffer.length > MAX_UPLOAD_BYTES) throw new PayloadTooLargeException('File exceeds 50 MB');
    const kind = sniffKind(file.originalname, file.buffer);
    if (!kind) throw new BadRequestException('Only valid .docx or .pdf files are accepted');

    const storageKey = `${instituteId}/ingestion/${randomUUID()}.${kind}`;
    await this.storage.put(storageKey, file.buffer, MIME[kind]!);
    const scan = await this.scanner.scan(file.buffer);
    const scanStatus = scan.status;
    const paper = await this.repo.insertPaper({
      instituteId,
      userId,
      title: title?.trim() || file.originalname,
      filename: file.originalname,
      mimeType: MIME[kind]!,
      storageKey,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
      sizeBytes: file.buffer.length,
      scanStatus,
      scanDetail: scan.status === 'infected' ? scan.signature : scan.status === 'error' ? scan.detail : null,
      status: scan.status === 'clean' ? 'parsing' : scan.status === 'infected' ? 'rejected' : 'failed',
    });
    if (scan.status === 'infected') throw new UnprocessableEntityException('File rejected by virus scan');
    if (scan.status === 'error') throw new ConflictException({ message: 'Virus scan unavailable; retry later', paperId: paper.id });
    await this.queue.enqueueParse({ paperId: paper.id, instituteId });
    return { id: paper.id, status: 'parsing' as const };
  }

  async list(instituteId: string): Promise<PaperSummary[]> {
    return (await this.repo.listPapers(instituteId)).map((p) => this.summary(p, p));
  }

  async get(instituteId: string, id: string): Promise<PaperDetail> {
    const paper = await this.mustGet(instituteId, id);
    const drafts = await this.repo.listDrafts(instituteId, id);
    return {
      ...this.summary(paper, this.counts(drafts, paper.answerKey)),
      answerKey: paper.answerKey,
      drafts,
      questionIds: drafts.flatMap((d) => (d.questionId ? [d.questionId] : [])),
      originalUrl: await this.storage.signedUrl(paper.storageKey, 900),
    };
  }

  async updateDraft(instituteId: string, paperId: string, draftId: string, input: unknown) {
    const paper = await this.mustBeEditable(instituteId, paperId);
    const draft = await this.repo.getDraft(instituteId, paper.id, draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    const { resolveFlags, ...fields } = updateDraftSchema.parse(input);
    const flags = resolveFlags?.length
      ? draft.flags.map((f) => (resolveFlags.includes(f.code) ? { ...f, resolved: true } : f))
      : undefined;
    const changedContent = Object.keys(fields).length > 0;
    await this.repo.updateDraft(instituteId, draftId, {
      ...fields,
      ...(flags ? { flags } : {}),
      ...(changedContent ? { label: 'MANUAL' as const } : {}),
    });
    return { ok: true };
  }

  async setAnswerKey(instituteId: string, paperId: string, input: unknown) {
    const paper = await this.mustBeEditable(instituteId, paperId);
    const body = setAnswerKeySchema.parse(input);
    const parsed = { ...(body.text ? parseAnswerKeyText(body.text) : {}), ...(body.key ?? {}) };
    if (!Object.keys(parsed).length) throw new BadRequestException('No answers recognised');
    const merged = { ...paper.answerKey, ...parsed };
    await this.repo.setAnswerKey(instituteId, paperId, merged);
    return { answerKey: merged, mapped: Object.keys(parsed).length };
  }

  /**
   * 422 when any unresolved error flag or any missing answer. Approval freezes the paper and, in the same
   * transaction, promotes every draft to a question (+ version 1). Idempotent: re-approving returns the stored ids.
   */
  async approve(instituteId: string, userId: string | null, paperId: string) {
    const paper = await this.mustGet(instituteId, paperId);
    if (paper.status === 'approved') return this.approvedResult(instituteId, paperId);
    if (paper.status !== 'review') throw new ConflictException(`Paper is ${paper.status}, not in review`);
    const drafts = await this.repo.listDrafts(instituteId, paperId);
    const gate = evaluateApproval(drafts, paper.answerKey);
    if (!gate.ok) throw new UnprocessableEntityException(gate.body);
    let items: PromoteItem[];
    try {
      items = drafts
        .filter((d) => !d.questionId)
        .map((d) => {
          const payload = draftToPayload(d, paper.answerKey);
          return { draftId: d.id, payload, searchText: buildSearchText(payload) };
        });
    } catch (e) {
      throw new UnprocessableEntityException({ statusCode: 422, message: (e as Error).message, openFlags: [], missingKey: [] });
    }
    const ids = await this.repo.approve(instituteId, paperId, userId, items);
    if (!ids) {
      // Lost a race: another request approved it first; return its result instead of duplicating.
      if ((await this.mustGet(instituteId, paperId)).status === 'approved') return this.approvedResult(instituteId, paperId);
      throw new ConflictException('Paper changed state; reload');
    }
    return { id: paperId, status: 'approved' as const, questionCount: ids.length, questionIds: ids };
  }

  private async approvedResult(instituteId: string, paperId: string) {
    const ids = await this.repo.listQuestionIds(instituteId, paperId);
    return { id: paperId, status: 'approved' as const, questionCount: ids.length, questionIds: ids };
  }

  private async mustGet(instituteId: string, id: string) {
    const p = await this.repo.getPaper(instituteId, id);
    if (!p) throw new NotFoundException('Paper not found');
    return p;
  }

  private async mustBeEditable(instituteId: string, id: string) {
    const p = await this.mustGet(instituteId, id);
    if (p.status === 'approved') throw new ConflictException('Approved papers are frozen');
    if (p.status !== 'review') throw new ConflictException(`Paper is ${p.status}, not in review`);
    return p;
  }

  private counts(drafts: Draft[], key: Record<string, string>) {
    return {
      questionCount: drafts.length,
      openFlagCount: drafts.filter((d) => d.flags.some((f) => f.severity === 'error' && !f.resolved)).length,
      missingKeyCount: drafts.filter((d) => effectiveAnswer(d, key) === null).length,
    };
  }

  private summary(
    p: PaperRow,
    c: { questionCount: number; openFlagCount: number; missingKeyCount: number },
  ): PaperSummary {
    return {
      id: p.id,
      title: p.title,
      filename: p.filename,
      status: p.status,
      scanStatus: p.scanStatus,
      parseError: p.parseError,
      questionCount: c.questionCount,
      openFlagCount: c.openFlagCount,
      missingKeyCount: c.missingKeyCount,
      createdAt: p.createdAt.toISOString(),
    };
  }
}

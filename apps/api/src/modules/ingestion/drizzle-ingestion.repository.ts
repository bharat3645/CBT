import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ingestionDrafts, ingestionPapers, questions, questionVersions } from '@cbt/db';
import type { Draft, DocparseResult } from '@cbt/contracts';
import { effectiveAnswer } from './approval-gate';
import { nextQuestionCode } from '../questions/question-logic';
import type { DraftPatch, PromoteItem, IngestionRepository, PaperRow } from './ingestion.repository';

const DRIZZLE = 'DRIZZLE';

const paperCols = {
  id: ingestionPapers.id,
  title: ingestionPapers.title,
  filename: ingestionPapers.filename,
  storageKey: ingestionPapers.storageKey,
  status: ingestionPapers.status,
  scanStatus: ingestionPapers.scanStatus,
  parseError: ingestionPapers.parseError,
  answerKey: ingestionPapers.answerKey,
  frozenVersion: ingestionPapers.frozenVersion,
  createdAt: ingestionPapers.createdAt,
};

type DraftRow = typeof ingestionDrafts.$inferSelect;
const toDraft = (r: DraftRow): Draft => ({
  id: r.id,
  paperId: r.paperId,
  number: r.number,
  ordinal: r.ordinal,
  section: r.section,
  type: r.type,
  stem: r.stem,
  options: r.options,
  answer: r.answer,
  confidence: r.confidence,
  label: r.label,
  flags: r.flags,
  source: r.source,
  questionId: r.questionId,
});

/** Expects the tenant-scoped (RLS) 'DRIZZLE' provider; instituteId is still filtered explicitly. */
@Injectable()
export class DrizzleIngestionRepository implements IngestionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async insertPaper(a: Parameters<IngestionRepository['insertPaper']>[0]) {
    const [row] = await this.db
      .insert(ingestionPapers)
      .values({
        instituteId: a.instituteId,
        createdBy: a.userId,
        title: a.title,
        filename: a.filename,
        mimeType: a.mimeType,
        storageKey: a.storageKey,
        sha256: a.sha256,
        sizeBytes: a.sizeBytes,
        scanStatus: a.scanStatus,
        scanDetail: a.scanDetail,
        status: a.status,
      })
      .returning({ id: ingestionPapers.id });
    return { id: row!.id };
  }

  async listPapers(instituteId: string) {
    const papers = await this.db
      .select(paperCols)
      .from(ingestionPapers)
      .where(eq(ingestionPapers.instituteId, instituteId))
      .orderBy(desc(ingestionPapers.createdAt));
    const drafts = await this.db.select().from(ingestionDrafts).where(eq(ingestionDrafts.instituteId, instituteId));
    return papers.map((p) => {
      const ds = drafts.filter((d) => d.paperId === p.id);
      return {
        ...p,
        questionCount: ds.length,
        openFlagCount: ds.filter((d) => d.flags.some((f) => f.severity === 'error' && !f.resolved)).length,
        missingKeyCount: ds.filter((d) => effectiveAnswer({ ...d, id: d.id }, p.answerKey) === null).length,
      };
    });
  }

  async getPaper(instituteId: string, id: string): Promise<PaperRow | null> {
    const [row] = await this.db
      .select(paperCols)
      .from(ingestionPapers)
      .where(and(eq(ingestionPapers.instituteId, instituteId), eq(ingestionPapers.id, id)));
    return row ?? null;
  }

  async listDrafts(instituteId: string, paperId: string) {
    const rows = await this.db
      .select()
      .from(ingestionDrafts)
      .where(and(eq(ingestionDrafts.instituteId, instituteId), eq(ingestionDrafts.paperId, paperId)))
      .orderBy(asc(ingestionDrafts.ordinal));
    return rows.map(toDraft);
  }

  async getDraft(instituteId: string, paperId: string, draftId: string) {
    const [row] = await this.db
      .select()
      .from(ingestionDrafts)
      .where(
        and(
          eq(ingestionDrafts.instituteId, instituteId),
          eq(ingestionDrafts.paperId, paperId),
          eq(ingestionDrafts.id, draftId),
        ),
      );
    return row ? toDraft(row) : null;
  }

  async updateDraft(instituteId: string, draftId: string, patch: DraftPatch) {
    await this.db
      .update(ingestionDrafts)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(ingestionDrafts.instituteId, instituteId), eq(ingestionDrafts.id, draftId)));
  }

  async setAnswerKey(instituteId: string, paperId: string, key: Record<string, string>) {
    await this.db
      .update(ingestionPapers)
      .set({ answerKey: key, updatedAt: new Date() })
      .where(and(eq(ingestionPapers.instituteId, instituteId), eq(ingestionPapers.id, paperId)));
  }

  storeParseResult(instituteId: string, paperId: string, result: DocparseResult) {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(ingestionDrafts)
        .where(and(eq(ingestionDrafts.instituteId, instituteId), eq(ingestionDrafts.paperId, paperId)));
      if (result.questions.length) {
        await tx.insert(ingestionDrafts).values(
          result.questions.map((q, i) => ({
            instituteId,
            paperId,
            number: q.number,
            ordinal: i,
            section: q.section,
            type: q.type,
            stem: q.stem,
            options: q.options.map((o) => ({ label: o.label, text: o.text })),
            answer: q.answer,
            confidence: q.confidence,
            label: q.label,
            flags: q.flags.map((f) => ({ ...f, resolved: false })),
            source: q.source,
          })),
        );
      }
      await tx
        .update(ingestionPapers)
        .set({ status: 'review', answerKey: result.answerKey, parseError: null, updatedAt: new Date() })
        .where(and(eq(ingestionPapers.instituteId, instituteId), eq(ingestionPapers.id, paperId)));
    });
  }

  async markFailed(instituteId: string, paperId: string, error: string) {
    await this.db
      .update(ingestionPapers)
      .set({ status: 'failed', parseError: error, updatedAt: new Date() })
      .where(and(eq(ingestionPapers.instituteId, instituteId), eq(ingestionPapers.id, paperId)));
  }

  async approve(instituteId: string, paperId: string, userId: string | null, items: PromoteItem[]) {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(ingestionPapers)
        .set({ status: 'approved', frozenVersion: 1, approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(ingestionPapers.instituteId, instituteId),
            eq(ingestionPapers.id, paperId),
            eq(ingestionPapers.status, 'review'),
          ),
        )
        .returning({ id: ingestionPapers.id });
      if (rows.length !== 1) return null;

      const drafts = await tx
        .select({ id: ingestionDrafts.id, questionId: ingestionDrafts.questionId })
        .from(ingestionDrafts)
        .where(and(eq(ingestionDrafts.instituteId, instituteId), eq(ingestionDrafts.paperId, paperId)))
        .orderBy(asc(ingestionDrafts.ordinal));
      const existing = await tx.select({ code: questions.code }).from(questions).where(eq(questions.instituteId, instituteId));
      const codes = existing.map((e) => e.code);
      const byDraft = new Map(items.map((it) => [it.draftId, it]));

      const ids: string[] = [];
      for (const d of drafts) {
        if (d.questionId) {
          ids.push(d.questionId);
          continue;
        }
        const it = byDraft.get(d.id);
        if (!it) throw new Error(`No promotion payload for draft ${d.id}`);
        const code = nextQuestionCode(codes);
        codes.push(code);
        const [q] = await tx
          .insert(questions)
          .values({
            instituteId,
            code,
            type: it.payload.type,
            difficulty: it.payload.difficulty,
            searchText: it.searchText,
            createdBy: userId,
          })
          .returning({ id: questions.id });
        await tx
          .insert(questionVersions)
          .values({ instituteId, questionId: q!.id, version: 1, payload: it.payload, changeNote: 'Imported from paper', createdBy: userId });
        await tx.update(ingestionDrafts).set({ questionId: q!.id }).where(eq(ingestionDrafts.id, d.id));
        ids.push(q!.id);
      }
      return ids;
    });
  }

  async listQuestionIds(instituteId: string, paperId: string) {
    const rows = await this.db
      .select({ questionId: ingestionDrafts.questionId })
      .from(ingestionDrafts)
      .where(and(eq(ingestionDrafts.instituteId, instituteId), eq(ingestionDrafts.paperId, paperId)))
      .orderBy(asc(ingestionDrafts.ordinal));
    return rows.flatMap((r) => (r.questionId ? [r.questionId] : []));
  }
}

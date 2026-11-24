import type { QuestionPayload, Draft, DocparseResult, DraftFlag, PaperStatus } from '@cbt/contracts';

export const INGESTION_REPOSITORY = Symbol('INGESTION_REPOSITORY');

export interface PaperRow {
  id: string;
  title: string;
  filename: string;
  storageKey: string;
  status: PaperStatus;
  scanStatus: 'pending' | 'clean' | 'infected' | 'error';
  parseError: string | null;
  answerKey: Record<string, string>;
  frozenVersion: number | null;
  createdAt: Date;
}

export type DraftPatch = Partial<Pick<Draft, 'section' | 'type' | 'stem' | 'options' | 'answer' | 'label'>> & {
  flags?: DraftFlag[];
};

export interface PromoteItem {
  draftId: string;
  payload: QuestionPayload;
  searchText: string;
}

export interface IngestionRepository {
  insertPaper(a: {
    instituteId: string;
    userId: string | null;
    title: string;
    filename: string;
    mimeType: string;
    storageKey: string;
    sha256: string;
    sizeBytes: number;
    scanStatus: PaperRow['scanStatus'];
    scanDetail: string | null;
    status: PaperStatus;
  }): Promise<{ id: string }>;
  listPapers(
    instituteId: string,
  ): Promise<(PaperRow & { questionCount: number; openFlagCount: number; missingKeyCount: number })[]>;
  getPaper(instituteId: string, id: string): Promise<PaperRow | null>;
  listDrafts(instituteId: string, paperId: string): Promise<Draft[]>;
  getDraft(instituteId: string, paperId: string, draftId: string): Promise<Draft | null>;
  updateDraft(instituteId: string, draftId: string, patch: DraftPatch): Promise<void>;
  setAnswerKey(instituteId: string, paperId: string, key: Record<string, string>): Promise<void>;
  /** Called by the worker after docparse returns: replaces drafts and moves the paper to `review`. */
  storeParseResult(instituteId: string, paperId: string, result: DocparseResult): Promise<void>;
  markFailed(instituteId: string, paperId: string, error: string): Promise<void>;
  /**
   * Atomic (one transaction): transitions review -> approved and creates a question + version 1 for every draft
   * that has no question yet. Returns question ids in draft order, or null if the paper was not in review.
   */
  approve(
    instituteId: string,
    paperId: string,
    userId: string | null,
    items: PromoteItem[],
  ): Promise<string[] | null>;
  /** Question ids already stored on an approved paper's drafts, in draft order. */
  listQuestionIds(instituteId: string, paperId: string): Promise<string[]>;
}

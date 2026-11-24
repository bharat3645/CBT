import type { QuestionPayload, QuestionSummary, QuestionVersion, SearchQuestions } from '@cbt/contracts';

export const QUESTION_REPOSITORY = Symbol('QUESTION_REPOSITORY');

export interface SimilarRow {
  id: string;
  code: string;
  searchText: string;
  similarity: number;
}

export interface QuestionRepository {
  nextCode(instituteId: string): Promise<string>;
  insert(args: {
    instituteId: string;
    userId: string | null;
    code: string;
    payload: QuestionPayload;
    searchText: string;
  }): Promise<{ id: string; code: string; version: number }>;
  addVersion(args: {
    instituteId: string;
    userId: string | null;
    questionId: string;
    payload: QuestionPayload;
    searchText: string;
    changeNote?: string;
  }): Promise<{ version: number } | null>;
  findVersion(instituteId: string, questionId: string, version?: number): Promise<QuestionVersion | null>;
  listVersions(instituteId: string, questionId: string): Promise<QuestionVersion[]>;
  similar(instituteId: string, text: string, excludeId?: string): Promise<SimilarRow[]>;
  search(instituteId: string, q: SearchQuestions): Promise<{ items: QuestionSummary[]; total: number }>;
}

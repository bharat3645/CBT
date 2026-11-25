import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  createQuestionSchema,
  updateQuestionSchema,
  type DuplicateCandidate,
  type QuestionPayload,
  type SearchQuestions,
} from '@cbt/contracts';
import { buildSearchText, rankDuplicates } from './question-logic';
import { QUESTION_REPOSITORY, type QuestionRepository } from './questions.repository';

@Injectable()
export class QuestionsService {
  constructor(@Inject(QUESTION_REPOSITORY) private readonly repo: QuestionRepository) {}

  async findDuplicates(instituteId: string, payload: QuestionPayload, excludeId?: string): Promise<DuplicateCandidate[]> {
    const text = buildSearchText(payload);
    if (!text) return [];
    return rankDuplicates(await this.repo.similar(instituteId, text, excludeId));
  }

  async checkStem(instituteId: string, stemText: string, excludeId?: string) {
    return rankDuplicates(await this.repo.similar(instituteId, stemText.toLowerCase().trim(), excludeId));
  }

  /** Duplicate warnings never block creation; they are returned with the created question. */
  async create(instituteId: string, userId: string | null, input: unknown) {
    const { payload } = createQuestionSchema.parse(input);
    const searchText = buildSearchText(payload);
    const duplicates = await this.findDuplicates(instituteId, payload);
    const code = await this.repo.nextCode(instituteId);
    const created = await this.repo.insert({ instituteId, userId, code, payload, searchText });
    return { ...created, duplicates };
  }

  /** Edits never mutate: a new immutable version is appended. */
  async update(instituteId: string, userId: string | null, questionId: string, input: unknown) {
    const { payload, changeNote } = updateQuestionSchema.parse(input);
    const res = await this.repo.addVersion({
      instituteId,
      userId,
      questionId,
      payload,
      searchText: buildSearchText(payload),
      changeNote,
    });
    if (!res) throw new NotFoundException('Question not found');
    return { id: questionId, version: res.version, duplicates: await this.findDuplicates(instituteId, payload, questionId) };
  }

  async get(instituteId: string, questionId: string, version?: number) {
    const v = await this.repo.findVersion(instituteId, questionId, version);
    if (!v) throw new NotFoundException('Question not found');
    return v;
  }

  async versions(instituteId: string, questionId: string) {
    const rows = await this.repo.listVersions(instituteId, questionId);
    if (!rows.length) throw new NotFoundException('Question not found'); // every question has at least version 1
    return rows;
  }

  search(instituteId: string, q: SearchQuestions) {
    return this.repo.search(instituteId, q);
  }
}

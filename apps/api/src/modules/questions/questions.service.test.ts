import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { QuestionPayload, QuestionVersion, RichDoc } from '@cbt/contracts';
import { buildSearchText, duplicateWarning, nextQuestionCode, rankDuplicates } from './question-logic';
import { QuestionsService } from './questions.service';
import type { QuestionRepository, SimilarRow } from './questions.repository';

const doc = (t: string): RichDoc => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const mcq = (stem: string): QuestionPayload => ({
  type: 'mcq_single',
  stem: doc(stem),
  options: [
    { id: 'A', content: doc('Yes') },
    { id: 'B', content: doc('No') },
  ],
  correct: ['A'],
  difficulty: 'easy',
  marks: 4,
  negativeMarks: 1,
  topicIds: [],
});

/** In-memory repo; `similar` is a naive word-overlap stand-in for pg_trgm. */
class FakeRepo implements QuestionRepository {
  rows: Array<{ id: string; instituteId: string; code: string; text: string; versions: QuestionVersion[] }> = [];
  async nextCode(inst: string) {
    return nextQuestionCode(this.rows.filter((r) => r.instituteId === inst).map((r) => r.code));
  }
  async insert(a: Parameters<QuestionRepository['insert']>[0]) {
    const id = `00000000-0000-4000-8000-${String(this.rows.length + 1).padStart(12, '0')}`;
    this.rows.push({ id, instituteId: a.instituteId, code: a.code, text: a.searchText, versions: [{ id: 'v', questionId: id, version: 1, payload: a.payload, changeNote: null, createdAt: new Date().toISOString() }] });
    return { id, code: a.code, version: 1 };
  }
  async addVersion(a: Parameters<QuestionRepository['addVersion']>[0]) {
    const r = this.rows.find((x) => x.id === a.questionId && x.instituteId === a.instituteId);
    if (!r) return null;
    const version = r.versions.length + 1;
    r.versions.push({ id: 'v', questionId: r.id, version, payload: a.payload, changeNote: a.changeNote ?? null, createdAt: new Date().toISOString() });
    r.text = a.searchText;
    return { version };
  }
  async findVersion(inst: string, id: string, version?: number) {
    const r = this.rows.find((x) => x.id === id && x.instituteId === inst);
    return r?.versions.find((v) => v.version === (version ?? r.versions.length)) ?? null;
  }
  async listVersions(inst: string, id: string) {
    return this.rows.find((x) => x.id === id && x.instituteId === inst)?.versions ?? [];
  }
  async similar(inst: string, text: string, exclude?: string): Promise<SimilarRow[]> {
    const a = new Set(text.split(' '));
    return this.rows
      .filter((r) => r.instituteId === inst && r.id !== exclude)
      .map((r) => {
        const b = new Set(r.text.split(' '));
        const inter = [...a].filter((w) => b.has(w)).length;
        return { id: r.id, code: r.code, searchText: r.text, similarity: inter / (a.size + b.size - inter) };
      });
  }
  async search() {
    return { items: [], total: 0 };
  }
}

const INST = 'inst-a';

describe('question-logic', () => {
  it('builds lowercase search text from stem and options', () => {
    expect(buildSearchText(mcq('What IS  Newton?'))).toBe('what is newton? yes no');
  });
  it('ranks duplicates over threshold only, best first', () => {
    const r = rankDuplicates([
      { id: 'a', code: 'Q1', searchText: 'x', similarity: 0.7 },
      { id: 'b', code: 'Q2', searchText: 'y', similarity: 0.95 },
      { id: 'c', code: 'Q3', searchText: 'z', similarity: 0.3 },
    ]);
    expect(r.map((c) => c.label)).toEqual(['Q2', 'Q1']);
    expect(duplicateWarning(r[0]!)).toBe('Possible duplicate of Q2 (95% similar)');
  });
  it('generates sequential codes', () => {
    expect(nextQuestionCode([])).toBe('Q1');
    expect(nextQuestionCode(['Q1', 'Q12', 'Q3'])).toBe('Q13');
  });
});

describe('QuestionsService', () => {
  it('warns about a possible duplicate but still creates the question', async () => {
    const svc = new QuestionsService(new FakeRepo());
    const first = await svc.create(INST, null, { payload: mcq('state newtons second law of motion') });
    expect(first.code).toBe('Q1');
    expect(first.duplicates).toEqual([]);
    const second = await svc.create(INST, null, { payload: mcq('state newtons second law of motion') });
    expect(second.code).toBe('Q2');
    expect(second.duplicates[0]).toMatchObject({ label: 'Q1' });
  });
  it('does not see duplicates from another institute', async () => {
    const svc = new QuestionsService(new FakeRepo());
    await svc.create(INST, null, { payload: mcq('same text here') });
    const other = await svc.create('inst-b', null, { payload: mcq('same text here') });
    expect(other.duplicates).toEqual([]);
  });
  it('appends immutable versions on update and keeps old ones readable', async () => {
    const svc = new QuestionsService(new FakeRepo());
    const { id } = await svc.create(INST, null, { payload: mcq('original stem') });
    const upd = await svc.update(INST, null, id, { payload: mcq('edited stem'), changeNote: 'typo' });
    expect(upd.version).toBe(2);
    expect((await svc.get(INST, id, 1)).payload.stem).toEqual(doc('original stem'));
    expect((await svc.get(INST, id)).version).toBe(2);
    expect(await svc.versions(INST, id)).toHaveLength(2);
  });
  it('404s for another tenant and rejects invalid payloads', async () => {
    const svc = new QuestionsService(new FakeRepo());
    const { id } = await svc.create(INST, null, { payload: mcq('abc def') });
    await expect(svc.get('inst-b', id)).rejects.toThrow('Question not found');
    await expect(svc.create(INST, null, { payload: { type: 'mcq_single', stem: doc('x') } })).rejects.toThrow();
  });
});

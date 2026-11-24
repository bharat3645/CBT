import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { UnprocessableEntityException } from '@nestjs/common';
import { ingestionDrafts, ingestionPapers, institutes, questions, questionVersions, withTenant, type DbHandle } from '@cbt/db';
import { createTestDb } from '@cbt/db/testing';
import { questionPayloadSchema } from '@cbt/contracts';
import { DrizzleIngestionRepository } from './drizzle-ingestion.repository';
import { IngestionService } from './ingestion.service';
import { draftToPayload, textToDoc } from './promote-draft';

let h: DbHandle;
let inst: string;

const source = { page: 1, bbox: null, blockStart: 0, blockEnd: 0 };

beforeAll(async () => {
  h = await createTestDb();
  [{ id: inst }] = (await h.db.insert(institutes).values({ name: 'A', slug: 'a', status: 'approved' }).returning({ id: institutes.id })) as any;
});
afterAll(async () => h?.close());

async function seedPaper(opts: { key?: Record<string, string>; flagFirst?: boolean } = {}) {
  const [p] = await h.db
    .insert(ingestionPapers)
    .values({
      instituteId: inst,
      title: 'P',
      filename: 'p.pdf',
      mimeType: 'application/pdf',
      storageKey: 'k',
      sha256: 'x',
      sizeBytes: 1,
      scanStatus: 'clean',
      status: 'review',
      answerKey: opts.key ?? { '1': 'B', '2': 'A,C', '3': '42.5' },
    })
    .returning({ id: ingestionPapers.id });
  const base = { instituteId: inst, paperId: p!.id, confidence: 0.9, source };
  await h.db.insert(ingestionDrafts).values([
    {
      ...base, number: 1, ordinal: 0, type: 'mcq', stem: 'Value of $x^2$ at 3?',
      options: [{ label: 'A', text: '6' }, { label: 'B', text: '9' }],
      flags: opts.flagFirst ? [{ code: 'X', message: 'm', severity: 'error' as const, resolved: false }] : [],
    },
    {
      ...base, number: 2, ordinal: 1, type: 'mcq', stem: 'Pick primes',
      options: [{ label: 'A', text: '2' }, { label: 'B', text: '4' }, { label: 'C', text: '3' }],
    },
    { ...base, number: 3, ordinal: 2, type: 'numeric', stem: 'Compute\n85/2' },
  ]);
  return p!.id;
}

const svc = (db: any) => new IngestionService(new DrizzleIngestionRepository(db) as any, {} as any, {} as any, {} as any);
const approve = (paperId: string) => withTenant(h.db, { instituteId: inst }, (tx) => svc(tx).approve(inst, null, paperId));

describe('approval promotes drafts to the question bank', () => {
  it('creates N questions with v1 payloads and stores ids on drafts', async () => {
    const paperId = await seedPaper();
    const res = await approve(paperId);
    expect(res.status).toBe('approved');
    expect(res.questionIds).toHaveLength(3);

    const drafts = await h.db.select().from(ingestionDrafts).where(eq(ingestionDrafts.paperId, paperId));
    expect(drafts.map((d) => d.questionId).sort()).toEqual([...res.questionIds].sort());

    const versions = await h.db.select().from(questionVersions);
    const byQ = new Map(versions.map((v) => [v.questionId, questionPayloadSchema.parse(v.payload)]));
    const [q1, q2, q3] = res.questionIds.map((id) => byQ.get(id)!);
    expect(q1).toMatchObject({ type: 'mcq_single', correct: ['B'] });
    expect(JSON.stringify(q1!.stem)).toContain('inlineMath');
    expect(q2).toMatchObject({ type: 'mcq_multi', correct: ['A', 'C'] });
    expect(q3).toMatchObject({ type: 'numeric', numeric: { answer: 42.5 } });
  });

  it('is idempotent: a second approve creates no duplicates', async () => {
    const paperId = await seedPaper();
    const before = (await h.db.select().from(questions)).length;
    const first = await approve(paperId);
    const second = await approve(paperId);
    expect(second.questionIds).toEqual(first.questionIds);
    expect((await h.db.select().from(questions)).length).toBe(before + 3);
  });

  it('keeps the 422 gate and creates nothing when blocked', async () => {
    const paperId = await seedPaper({ key: { '1': 'B' }, flagFirst: true });
    const before = (await h.db.select().from(questions)).length;
    await expect(approve(paperId)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect((await h.db.select().from(questions)).length).toBe(before);
    const [p] = await h.db.select().from(ingestionPapers).where(eq(ingestionPapers.id, paperId));
    expect(p!.status).toBe('review');
  });
});

describe('draftToPayload', () => {
  it('splits LaTeX segments into inlineMath nodes', () => {
    expect(textToDoc('a $b$ c').content![0]!.content).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'inlineMath', attrs: { latex: 'b' } },
      { type: 'text', text: ' c' },
    ]);
  });
  it('rejects a correct answer that is not an option', () => {
    const d: any = { id: 'i', number: 1, type: 'mcq', stem: 's', answer: 'D', flags: [], options: [{ label: 'A', text: 'x' }, { label: 'B', text: 'y' }] };
    expect(() => draftToPayload(d, {})).toThrow(/Unknown option D/);
  });
});

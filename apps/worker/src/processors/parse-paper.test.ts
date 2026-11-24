import { describe, it, expect, vi } from 'vitest';
import { parsePaper } from './parse-paper';

const IDS = { paperId: '11111111-1111-4111-8111-111111111111', instituteId: '22222222-2222-4222-8222-222222222222' };

const goodResult = {
  filename: 'p.pdf', sections: ['Physics'], answerKey: { '1': 'A' }, aiPassApplied: false,
  questions: [{
    number: 1, section: 'Physics', type: 'mcq', stem: 'What is 2+2?',
    options: [{ label: 'A', text: '4' }, { label: 'B', text: '5' }], answer: 'A', confidence: 0.9, label: 'EXTRACTED',
    flags: [{ code: 'X', message: 'm', severity: 'warning' }],
    source: { page: 1, bbox: null, blockStart: 0, blockEnd: 2 },
  }],
};

/** Fake drizzle: records updates/inserts/deletes; select() resolves to the given rows. */
function fakeDb(paper: any) {
  const log: { op: string; values?: any }[] = [];
  const chain = (op: string) => {
    const c: any = { values: (v: any) => { log.push({ op, values: v }); return c; }, set: (v: any) => { log.push({ op, values: v }); return c; }, where: () => c, then: (r: any) => r(undefined) };
    return c;
  };
  const db: any = {
    select: () => ({ from: () => ({ where: async () => (paper ? [paper] : []) }) }),
    update: () => chain('update'), insert: () => chain('insert'), delete: () => chain('delete'),
    transaction: async (fn: any) => fn(db),
  };
  return { db, log };
}
const paper = { id: IDS.paperId, instituteId: IDS.instituteId, status: 'uploaded', scanStatus: 'clean', storageKey: 'k/p.pdf', filename: 'p.pdf', mimeType: 'application/pdf' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('parsePaper', () => {
  it('posts multipart to /parse and stores drafts', async () => {
    const { db, log } = fakeDb(paper);
    const fetchMock = vi.fn(async () => json(goodResult));
    const getObject = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const out = await parsePaper({ db, getObject, docparseUrl: 'http://dp:8000/', fetch: fetchMock as any }, IDS);
    expect(out).toEqual({ status: 'review', questions: 1 });
    expect(getObject).toHaveBeenCalledWith('k/p.pdf');
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toBe('http://dp:8000/parse');
    expect((init.body as FormData).get('file')).toBeInstanceOf(Blob);
    const ins = log.find((l) => l.op === 'insert')!.values;
    expect(ins[0]).toMatchObject({ instituteId: IDS.instituteId, paperId: IDS.paperId, ordinal: 0, flags: [{ code: 'X', resolved: false }] });
    expect(log.at(-1)!.values).toMatchObject({ status: 'review', answerKey: { '1': 'A' } });
  });

  it('marks failed permanently on 4xx without retry', async () => {
    const { db, log } = fakeDb(paper);
    const out = await parsePaper({ db, getObject: async () => new Uint8Array(), docparseUrl: 'http://dp', fetch: (async () => json({ detail: 'bad' }, 422)) as any }, IDS, false);
    expect(out.status).toBe('failed');
    expect(log.at(-1)!.values).toMatchObject({ status: 'failed' });
  });

  it('rejects an invalid docparse payload', async () => {
    const { db, log } = fakeDb(paper);
    const out = await parsePaper({ db, getObject: async () => new Uint8Array(), docparseUrl: 'http://dp', fetch: (async () => json({ nope: 1 })) as any }, IDS, false);
    expect(out).toMatchObject({ status: 'failed' });
    expect(log.some((l) => l.op === 'insert')).toBe(false);
  });

  it('throws on a transient 5xx so BullMQ retries, but fails on the final attempt', async () => {
    const mk = () => ({ db: fakeDb(paper), getObject: async () => new Uint8Array(), docparseUrl: 'http://dp', fetch: (async () => json({}, 503)) as any });
    const a = mk();
    await expect(parsePaper({ ...a, db: a.db.db }, IDS, false)).rejects.toThrow(/503/);
    const b = mk();
    expect((await parsePaper({ ...b, db: b.db.db }, IDS, true)).status).toBe('failed');
  });

  it('skips missing papers and infected files fail without calling docparse', async () => {
    const fetchMock = vi.fn();
    expect(await parsePaper({ db: fakeDb(null).db, getObject: async () => new Uint8Array(), docparseUrl: 'x', fetch: fetchMock as any }, IDS)).toMatchObject({ status: 'skipped' });
    const out = await parsePaper({ db: fakeDb({ ...paper, scanStatus: 'infected' }).db, getObject: async () => new Uint8Array(), docparseUrl: 'x', fetch: fetchMock as any }, IDS);
    expect(out.status).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

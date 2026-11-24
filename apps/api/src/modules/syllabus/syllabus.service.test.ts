import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { SyllabusNode, TopicProgress } from '@cbt/contracts';
import { buildTree, completionPercent, isValidPlacement, planTemplateCopy, topicIdsUnder } from './syllabus-logic';
import { SyllabusService } from './syllabus.service';
import type { SyllabusRepository } from './syllabus.repository';

const n = (id: string, level: SyllabusNode['level'], parentId: string | null, name = id, position = 0): SyllabusNode => ({ id, level, parentId, name, position });
const nodes: SyllabusNode[] = [
  n('e', 'exam', null),
  n('s', 'subject', 'e'),
  n('u', 'unit', 's'),
  n('c', 'chapter', 'u'),
  n('t1', 'topic', 'c', 'B topic', 1),
  n('t2', 'topic', 'c', 'A topic', 0),
];

describe('syllabus-logic', () => {
  it('builds a sorted tree', () => {
    const tree = buildTree(nodes);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children[0]!.children[0]!.children[0]!.children.map((x) => x.id)).toEqual(['t2', 't1']);
  });
  it('validates level placement', () => {
    expect(isValidPlacement('exam', null)).toBe(true);
    expect(isValidPlacement('topic', 'chapter')).toBe(true);
    expect(isValidPlacement('topic', 'subject')).toBe(false);
    expect(isValidPlacement('subject', null)).toBe(false);
  });
  it('finds topics under a node', () => {
    expect(topicIdsUnder(nodes, 's').sort()).toEqual(['t1', 't2']);
    expect(topicIdsUnder(nodes, 't1')).toEqual(['t1']);
  });
  it('copies a template with fresh ids and source links', () => {
    let i = 0;
    const rows = planTemplateCopy(nodes, 'e', () => `new${i++}`);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ id: 'new0', parentId: null, templateNodeId: 'e' });
    expect(rows[1]).toMatchObject({ parentId: 'new0', templateNodeId: 's' });
    expect(rows.some((r) => nodes.some((o) => o.id === r.id))).toBe(false);
  });
  it('computes completion percent', () => {
    expect(completionPercent([], new Set())).toBe(0);
    expect(completionPercent(['a', 'b', 'c'], new Set(['a']))).toBe(33);
  });
});

class FakeRepo implements Partial<SyllabusRepository> {
  progress: Array<TopicProgress> = [];
  async listNodes() {
    return nodes;
  }
  async getNode(_i: string, id: string) {
    return nodes.find((x) => x.id === id) ?? null;
  }
  async listProgress(_i: string, batchId: string) {
    return this.progress.filter((p) => p.batchId === batchId);
  }
  async upsertProgress(_i: string, batchId: string, topicId: string, p: { status: TopicProgress['status'] }) {
    this.progress = this.progress.filter((x) => !(x.batchId === batchId && x.topicId === topicId));
    const row: TopicProgress = { batchId, topicId, status: p.status, completedAt: p.status === 'completed' ? 'x' : null };
    this.progress.push(row);
    return row;
  }
}
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('SyllabusService batch progress', () => {
  it("Batch A progress never changes Batch B", async () => {
    const svc = new SyllabusService(new FakeRepo() as unknown as SyllabusRepository);
    await svc.setTopicProgress('inst', A, 't1', { status: 'completed' });
    const a = await svc.batchProgress('inst', A);
    const b = await svc.batchProgress('inst', B);
    expect(a.overallPercent).toBe(50);
    expect(a.percentByNode.s).toBe(50);
    expect(b.overallPercent).toBe(0);
    expect(b.progress).toEqual([]);
  });
  it('only allows progress on topics', async () => {
    const svc = new SyllabusService(new FakeRepo() as unknown as SyllabusRepository);
    await expect(svc.setTopicProgress('inst', A, 'c', { status: 'completed' })).rejects.toThrow('Topic not found');
  });
  it('rejects mis-levelled nodes', async () => {
    const svc = new SyllabusService(new FakeRepo() as unknown as SyllabusRepository);
    await expect(svc.createNode('inst', { level: 'topic', parentId: 's' === 's' ? '33333333-3333-4333-8333-333333333333' : null, name: 'x' })).rejects.toThrow();
  });
});

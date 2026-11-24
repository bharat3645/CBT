import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { batchTopicProgress, syllabusMaterials, syllabusNodes } from '@cbt/db';
import type { CreateSyllabusNode, SetTopicProgress, SyllabusNode, TopicProgress } from '@cbt/contracts';
import { DRIZZLE } from '../questions/drizzle-questions.repository';
import type { TemplateCopyRow } from './syllabus-logic';
import type { MaterialRow, SyllabusRepository } from './syllabus.repository';

const toNode = (r: typeof syllabusNodes.$inferSelect): SyllabusNode => ({
  id: r.id,
  parentId: r.parentId,
  level: r.level,
  name: r.name,
  position: r.position,
});
const toProgress = (r: typeof batchTopicProgress.$inferSelect): TopicProgress => ({
  batchId: r.batchId,
  topicId: r.topicId,
  status: r.status,
  completedAt: r.completedAt?.toISOString() ?? null,
});
const toMaterial = (r: typeof syllabusMaterials.$inferSelect): MaterialRow => ({
  id: r.id,
  topicId: r.topicId,
  title: r.title,
  storageKey: r.storageKey,
  mimeType: r.mimeType,
  sizeBytes: r.sizeBytes,
});

@Injectable()
export class DrizzleSyllabusRepository implements SyllabusRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async listNodes(instituteId: string) {
    return (await this.db.select().from(syllabusNodes).where(eq(syllabusNodes.instituteId, instituteId))).map(toNode);
  }
  async listTemplateNodes() {
    return (await this.db.select().from(syllabusNodes).where(isNull(syllabusNodes.instituteId))).map(toNode);
  }
  async getNode(instituteId: string, id: string) {
    const [r] = await this.db
      .select()
      .from(syllabusNodes)
      .where(and(eq(syllabusNodes.id, id), eq(syllabusNodes.instituteId, instituteId)));
    return r ? toNode(r) : null;
  }
  async insertNode(instituteId: string, input: CreateSyllabusNode) {
    const [r] = await this.db.insert(syllabusNodes).values({ ...input, instituteId }).returning();
    return toNode(r!);
  }
  async updateNode(instituteId: string, id: string, patch: { name?: string; position?: number }) {
    if (!Object.keys(patch).length) return this.getNode(instituteId, id);
    const [r] = await this.db
      .update(syllabusNodes)
      .set(patch)
      .where(and(eq(syllabusNodes.id, id), eq(syllabusNodes.instituteId, instituteId)))
      .returning();
    return r ? toNode(r) : null;
  }
  async deleteNode(instituteId: string, id: string) {
    const all = await this.listNodes(instituteId);
    if (!all.some((n) => n.id === id)) return false;
    const doomed = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of all) {
        if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) {
          doomed.add(n.id);
          grew = true;
        }
      }
    }
    for (const nodeId of doomed)
      await this.db.delete(syllabusNodes).where(and(eq(syllabusNodes.id, nodeId), eq(syllabusNodes.instituteId, instituteId)));
    return true;
  }
  async insertMany(instituteId: string, rows: TemplateCopyRow[]) {
    await this.db.insert(syllabusNodes).values(
      rows.map((r) => ({
        id: r.id,
        instituteId,
        parentId: r.parentId,
        level: r.level,
        name: r.name,
        position: r.position,
        templateNodeId: r.templateNodeId,
      })),
    );
  }
  async addMaterial(instituteId: string, m: Omit<MaterialRow, 'id'>) {
    const [r] = await this.db.insert(syllabusMaterials).values({ ...m, instituteId }).returning();
    return toMaterial(r!);
  }
  async listMaterials(instituteId: string, topicId: string) {
    const rows = await this.db
      .select()
      .from(syllabusMaterials)
      .where(and(eq(syllabusMaterials.instituteId, instituteId), eq(syllabusMaterials.topicId, topicId)));
    return rows.map(toMaterial);
  }
  async listProgress(instituteId: string, batchId: string) {
    const rows = await this.db
      .select()
      .from(batchTopicProgress)
      .where(and(eq(batchTopicProgress.instituteId, instituteId), eq(batchTopicProgress.batchId, batchId)));
    return rows.map(toProgress);
  }
  async upsertProgress(instituteId: string, batchId: string, topicId: string, p: SetTopicProgress) {
    const completedAt = p.status === 'completed' ? new Date() : null;
    const [r] = await this.db
      .insert(batchTopicProgress)
      .values({ instituteId, batchId, topicId, status: p.status, note: p.note, completedAt })
      .onConflictDoUpdate({
        target: [batchTopicProgress.batchId, batchTopicProgress.topicId],
        set: { status: p.status, note: p.note, completedAt, updatedAt: new Date() },
      })
      .returning();
    return toProgress(r!);
  }
}

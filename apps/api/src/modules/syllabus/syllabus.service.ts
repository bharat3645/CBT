import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  copyTemplateSchema,
  createMaterialSchema,
  createSyllabusNodeSchema,
  setTopicProgressSchema,
  updateSyllabusNodeSchema,
} from '@cbt/contracts';
import { buildTree, completionPercent, isValidPlacement, planTemplateCopy, topicIdsUnder } from './syllabus-logic';
import { SYLLABUS_REPOSITORY, type SyllabusRepository } from './syllabus.repository';

@Injectable()
export class SyllabusService {
  constructor(@Inject(SYLLABUS_REPOSITORY) private readonly repo: SyllabusRepository) {}

  async tree(instituteId: string) {
    return buildTree(await this.repo.listNodes(instituteId));
  }

  async templates() {
    return buildTree(await this.repo.listTemplateNodes());
  }

  async createNode(instituteId: string, input: unknown) {
    const data = createSyllabusNodeSchema.parse(input);
    const parent = data.parentId ? await this.repo.getNode(instituteId, data.parentId) : null;
    if (data.parentId && !parent) throw new NotFoundException('Parent node not found');
    if (!isValidPlacement(data.level, parent?.level ?? null))
      throw new BadRequestException(`A ${data.level} cannot be placed under ${parent?.level ?? 'the root'}`);
    return this.repo.insertNode(instituteId, data);
  }

  async updateNode(instituteId: string, id: string, input: unknown) {
    const node = await this.repo.updateNode(instituteId, id, updateSyllabusNodeSchema.parse(input));
    if (!node) throw new NotFoundException('Node not found');
    return node;
  }

  async deleteNode(instituteId: string, id: string) {
    if (!(await this.repo.deleteNode(instituteId, id))) throw new NotFoundException('Node not found');
  }

  /** Copy a global template (exam subtree) into the institute. */
  async copyTemplate(instituteId: string, input: unknown) {
    const { templateRootId } = copyTemplateSchema.parse(input);
    const rows = planTemplateCopy(await this.repo.listTemplateNodes(), templateRootId, randomUUID);
    if (!rows.length) throw new NotFoundException('Template not found');
    await this.repo.insertMany(instituteId, rows);
    return { rootId: rows[0]!.id, nodes: rows.length };
  }

  async addMaterial(instituteId: string, input: unknown) {
    const m = createMaterialSchema.parse(input);
    const topic = await this.repo.getNode(instituteId, m.topicId);
    if (!topic || topic.level !== 'topic') throw new BadRequestException('Material must attach to a topic');
    return this.repo.addMaterial(instituteId, m);
  }

  materials(instituteId: string, topicId: string) {
    return this.repo.listMaterials(instituteId, topicId);
  }

  /** Progress for one batch only; other batches are never read or written. */
  async batchProgress(instituteId: string, batchId: string) {
    const [nodes, progress] = await Promise.all([this.repo.listNodes(instituteId), this.repo.listProgress(instituteId, batchId)]);
    const done = new Set(progress.filter((p) => p.status === 'completed').map((p) => p.topicId));
    const topics = nodes.filter((n) => n.level === 'topic').map((n) => n.id);
    const percentByNode = Object.fromEntries(
      nodes.filter((n) => n.level !== 'topic').map((n) => [n.id, completionPercent(topicIdsUnder(nodes, n.id), done)]),
    );
    return { progress, overallPercent: completionPercent(topics, done), percentByNode };
  }

  async setTopicProgress(instituteId: string, batchId: string, topicId: string, input: unknown) {
    const node = await this.repo.getNode(instituteId, topicId);
    if (!node || node.level !== 'topic') throw new NotFoundException('Topic not found');
    return this.repo.upsertProgress(instituteId, batchId, topicId, setTopicProgressSchema.parse(input));
  }
}

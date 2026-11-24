import type { CreateSyllabusNode, SetTopicProgress, SyllabusNode, TopicProgress } from '@cbt/contracts';
import type { TemplateCopyRow } from './syllabus-logic';

export const SYLLABUS_REPOSITORY = Symbol('SYLLABUS_REPOSITORY');

export interface MaterialRow {
  id: string;
  topicId: string;
  title: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SyllabusRepository {
  /** Institute-owned nodes. */
  listNodes(instituteId: string): Promise<SyllabusNode[]>;
  /** Global templates (instituteId IS NULL). */
  listTemplateNodes(): Promise<SyllabusNode[]>;
  getNode(instituteId: string, id: string): Promise<SyllabusNode | null>;
  insertNode(instituteId: string, input: CreateSyllabusNode): Promise<SyllabusNode>;
  updateNode(instituteId: string, id: string, patch: { name?: string; position?: number }): Promise<SyllabusNode | null>;
  deleteNode(instituteId: string, id: string): Promise<boolean>;
  insertMany(instituteId: string, rows: TemplateCopyRow[]): Promise<void>;
  addMaterial(instituteId: string, m: Omit<MaterialRow, 'id'>): Promise<MaterialRow>;
  listMaterials(instituteId: string, topicId: string): Promise<MaterialRow[]>;
  listProgress(instituteId: string, batchId: string): Promise<TopicProgress[]>;
  upsertProgress(instituteId: string, batchId: string, topicId: string, p: SetTopicProgress): Promise<TopicProgress>;
}

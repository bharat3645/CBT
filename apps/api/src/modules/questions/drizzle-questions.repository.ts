import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { questions, questionTopics, questionVersions } from '@cbt/db';
import type { QuestionPayload, QuestionSummary, QuestionVersion, SearchQuestions } from '@cbt/contracts';
import { nextQuestionCode, snippet } from './question-logic';
import type { QuestionRepository, SimilarRow } from './questions.repository';

export const DRIZZLE = 'DRIZZLE';

/** Syllabus node ids at or below a node (so exam/subject filters match their topics). */
const nodesUnder = (nodeId: string) => sql`(
  WITH RECURSIVE t AS (
    SELECT id FROM syllabus_nodes WHERE id = ${nodeId}
    UNION ALL SELECT n.id FROM syllabus_nodes n JOIN t ON n.parent_id = t.id
  ) SELECT id FROM t)`;

const escapeLike = (s: string) => s.replace(/[%_\\]/g, (c) => '\\' + c);

@Injectable()
export class DrizzleQuestionRepository implements QuestionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async nextCode(instituteId: string) {
    const rows = await this.db.select({ code: questions.code }).from(questions).where(eq(questions.instituteId, instituteId));
    return nextQuestionCode(rows.map((r) => r.code));
  }

  /** Topic links must point at a syllabus node this institute can see (its own, or a global template). */
  private async assertTopics(tx: { execute: (q: any) => Promise<any> }, instituteId: string, topicIds: string[]) {
    const ids = [...new Set(topicIds)];
    if (!ids.length) return;
    const res: any = await tx.execute(sql`SELECT count(*)::int AS n FROM syllabus_nodes
      WHERE id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) AND (institute_id = ${instituteId}::uuid OR institute_id IS NULL)`);
    if (((res.rows ?? res)[0]?.n ?? 0) !== ids.length) throw new BadRequestException('Unknown topic');
  }

  insert(a: { instituteId: string; userId: string | null; code: string; payload: QuestionPayload; searchText: string }) {
    return this.db.transaction(async (tx) => {
      await this.assertTopics(tx, a.instituteId, a.payload.topicIds);
      const [q] = await tx
        .insert(questions)
        .values({
          instituteId: a.instituteId,
          code: a.code,
          type: a.payload.type,
          difficulty: a.payload.difficulty,
          searchText: a.searchText,
          createdBy: a.userId,
        })
        .returning({ id: questions.id, code: questions.code });
      await tx.insert(questionVersions).values({
        instituteId: a.instituteId,
        questionId: q!.id,
        version: 1,
        payload: a.payload,
        createdBy: a.userId,
      });
      if (a.payload.topicIds.length)
        await tx
          .insert(questionTopics)
          .values(a.payload.topicIds.map((topicId) => ({ questionId: q!.id, topicId, instituteId: a.instituteId })));
      return { id: q!.id, code: q!.code, version: 1 };
    });
  }

  addVersion(a: {
    instituteId: string;
    userId: string | null;
    questionId: string;
    payload: QuestionPayload;
    searchText: string;
    changeNote?: string;
  }) {
    return this.db.transaction(async (tx) => {
      const [cur] = await tx
        .select({ v: questions.currentVersion })
        .from(questions)
        .where(and(eq(questions.id, a.questionId), eq(questions.instituteId, a.instituteId)))
        .for('update');
      if (!cur) return null;
      await this.assertTopics(tx, a.instituteId, a.payload.topicIds);
      const version = cur.v + 1;
      await tx.insert(questionVersions).values({
        instituteId: a.instituteId,
        questionId: a.questionId,
        version,
        payload: a.payload,
        changeNote: a.changeNote,
        createdBy: a.userId,
      });
      await tx
        .update(questions)
        .set({
          currentVersion: version,
          type: a.payload.type,
          difficulty: a.payload.difficulty,
          searchText: a.searchText,
          updatedAt: new Date(),
        })
        .where(eq(questions.id, a.questionId));
      await tx.delete(questionTopics).where(eq(questionTopics.questionId, a.questionId));
      if (a.payload.topicIds.length)
        await tx
          .insert(questionTopics)
          .values(a.payload.topicIds.map((topicId) => ({ questionId: a.questionId, topicId, instituteId: a.instituteId })));
      return { version };
    });
  }

  private toVersion(r: typeof questionVersions.$inferSelect): QuestionVersion {
    return {
      id: r.id,
      questionId: r.questionId,
      version: r.version,
      payload: r.payload as QuestionPayload,
      changeNote: r.changeNote,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async findVersion(instituteId: string, questionId: string, version?: number) {
    const [row] = await this.db
      .select({ v: questionVersions })
      .from(questionVersions)
      .innerJoin(questions, eq(questions.id, questionVersions.questionId))
      .where(
        and(
          eq(questions.instituteId, instituteId),
          eq(questions.id, questionId),
          eq(questionVersions.version, version ?? sql`${questions.currentVersion}`),
        ),
      );
    return row ? this.toVersion(row.v) : null;
  }

  async listVersions(instituteId: string, questionId: string) {
    const rows = await this.db
      .select()
      .from(questionVersions)
      .where(and(eq(questionVersions.instituteId, instituteId), eq(questionVersions.questionId, questionId)))
      .orderBy(desc(questionVersions.version));
    return rows.map((r) => this.toVersion(r));
  }

  async similar(instituteId: string, text: string, excludeId?: string): Promise<SimilarRow[]> {
    const res = await this.db.execute(sql`
      SELECT id, code, search_text AS "searchText", similarity(search_text, ${text})::float AS similarity
      FROM questions
      WHERE institute_id = ${instituteId} AND search_text % ${text}
        ${excludeId ? sql`AND id <> ${excludeId}` : sql``}
      ORDER BY similarity DESC LIMIT 10`);
    return res.rows as unknown as SimilarRow[];
  }

  async search(instituteId: string, q: SearchQuestions) {
    const conds = [sql`q.institute_id = ${instituteId}`];
    if (q.type) conds.push(sql`q.type = ${q.type}`);
    if (q.difficulty) conds.push(sql`q.difficulty = ${q.difficulty}`);
    if (q.q)
      conds.push(
        sql`(q.search_text ILIKE ${'%' + escapeLike(q.q) + '%'} OR q.search_text % ${q.q.toLowerCase()} OR q.code ILIKE ${escapeLike(q.q)})`,
      );
    for (const node of [q.examId, q.subjectId, q.topicId]) {
      if (node)
        conds.push(
          sql`EXISTS (SELECT 1 FROM question_topics qt WHERE qt.question_id = q.id AND qt.topic_id IN ${nodesUnder(node)})`,
        );
    }
    const where = sql.join(conds, sql` AND `);
    const offset = (q.page - 1) * q.pageSize;
    const countRes = await this.db.execute(sql`SELECT count(*)::int AS n FROM questions q WHERE ${where}`);
    const total = Number((countRes.rows[0] as { n?: number } | undefined)?.n ?? 0);
    const rows = (
      await this.db.execute(sql`
        SELECT q.id, q.code, q.type, q.difficulty, q.search_text AS "searchText", q.current_version AS "currentVersion",
               q.updated_at AS "updatedAt",
               COALESCE((SELECT array_agg(qt.topic_id) FROM question_topics qt WHERE qt.question_id = q.id), '{}') AS "topicIds"
        FROM questions q WHERE ${where}
        ORDER BY q.updated_at DESC LIMIT ${q.pageSize} OFFSET ${offset}`)
    ).rows as Array<Record<string, any>>;
    const items: QuestionSummary[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      type: r.type,
      difficulty: r.difficulty,
      snippet: snippet(r.searchText),
      topicIds: r.topicIds,
      currentVersion: r.currentVersion,
      updatedAt: new Date(r.updatedAt).toISOString(),
    }));
    return { items, total };
  }
}

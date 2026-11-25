/**
 * Real Institute A fixtures for the isolation suite. Every id-taking route case targets one of these rows,
 * so a 403/404 for Institute B is a genuine isolation result and not just "that id does not exist".
 * Inserts use the system (owner) connection, exactly like the harness' createInstitute().
 */
import {
  answerKeyRevisions, attemptAnswers, attemptIncidents, attempts, batchTopicProgress, evaluationItems, evaluations,
  importJobs, ingestionDrafts, ingestionPapers, notifications, questionTopics, questionVersions, questions, rankings,
  resultSettings, syllabusMaterials, syllabusNodes, tests,
} from "@cbt/db";
import type { Fixture, Harness } from "../harness";

/** Distinctive strings planted in A's rows; they must never appear in anything B receives. */
export const SECRETS = {
  testTitle: "ALPHA-SECRET-TEST-TITLE",
  paperTitle: "ALPHA-SECRET-PAPER-TITLE",
  stem: "ALPHA-SECRET-STEM",
  topic: "ALPHA-SECRET-TOPIC",
  material: "ALPHA-SECRET-MATERIAL",
  notification: "ALPHA-SECRET-NOTIFICATION",
  importFile: "ALPHA-SECRET-IMPORT.csv",
};

export interface Extras {
  questionId: string;
  rootNodeId: string;
  topicId: string;
  materialId: string;
  paperId: string;
  draftId: string;
  testId: string;
  draftTestId: string;
  attemptId: string;
  evaluationId: string;
  notificationId: string;
  importId: string;
  /** a closed test with a submitted attempt, released evaluation and rankings */
  resultTestId: string;
  resultAttemptId: string;
  /** every uuid planted for A (used for leak scans) */
  allIds: string[];
}
export type AFix = Fixture & Extras;

const para = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

export async function seedAlpha(h: Harness, A: Fixture): Promise<AFix> {
  const db = h.db;
  const inst = A.institute.id;
  const studentUser = A.student.userId;
  const now = Date.now();

  // question bank
  const [q] = await db.insert(questions).values({ instituteId: inst, code: "Q1", type: "mcq_single", difficulty: "medium", searchText: SECRETS.stem, createdBy: A.admin.userId }).returning({ id: questions.id });
  const payload = {
    type: "mcq_single", stem: para(SECRETS.stem), difficulty: "medium", marks: 4, negativeMarks: 1, topicIds: [],
    options: [{ id: "A", content: para("opt a") }, { id: "B", content: para("opt b") }], correct: ["A"],
  };
  await db.insert(questionVersions).values({ instituteId: inst, questionId: q!.id, version: 1, payload, createdBy: A.admin.userId });

  // syllabus: exam -> topic, with a material and per-batch progress
  const [root] = await db.insert(syllabusNodes).values({ instituteId: inst, parentId: null, level: "exam", name: "ALPHA-SECRET-EXAM" }).returning({ id: syllabusNodes.id });
  const [topic] = await db.insert(syllabusNodes).values({ instituteId: inst, parentId: root!.id, level: "topic", name: SECRETS.topic }).returning({ id: syllabusNodes.id });
  await db.insert(questionTopics).values({ questionId: q!.id, topicId: topic!.id, instituteId: inst });
  const [mat] = await db.insert(syllabusMaterials).values({ instituteId: inst, topicId: topic!.id, title: SECRETS.material, storageKey: "alpha/secret.pdf", mimeType: "application/pdf", sizeBytes: 10 }).returning({ id: syllabusMaterials.id });
  await db.insert(batchTopicProgress).values({ instituteId: inst, batchId: A.batchId, topicId: topic!.id, status: "in_progress", note: "alpha progress" });

  // paper ingestion: a paper in review with one draft (open flag + no key, so it cannot be approved)
  const [paper] = await db.insert(ingestionPapers).values({
    instituteId: inst, title: SECRETS.paperTitle, filename: "alpha.pdf", mimeType: "application/pdf", storageKey: "alpha/paper.pdf",
    sha256: "0".repeat(64), sizeBytes: 100, scanStatus: "clean", status: "review", answerKey: {}, createdBy: A.admin.userId,
  }).returning({ id: ingestionPapers.id });
  const [draft] = await db.insert(ingestionDrafts).values({
    instituteId: inst, paperId: paper!.id, number: 1, ordinal: 1, section: "S1", type: "mcq", stem: SECRETS.stem,
    options: [{ label: "A", text: "x" }, { label: "B", text: "y" }], answer: null, confidence: 0.5,
    flags: [{ code: "LOW_CONFIDENCE", message: "check", severity: "error", resolved: false }],
    source: { page: 1, bbox: null, blockStart: 0, blockEnd: 1 },
  }).returning({ id: ingestionDrafts.id });

  // exams: a published test the student is mid-attempt on, plus a draft test
  const config = { navigation: "free", palette: "five_state", marking: { correct: 4, wrong: -1, unattempted: 0 }, numeric: { enabled: true, decimals: 2 }, strictLevel: "off", maxIncidents: 0, explanationsAfterEach: false, allowMobile: true };
  const testBase = {
    instituteId: inst, paperId: paper!.id, presetKey: "practice", config, sections: [{ name: "S1", questionIds: [q!.id] }],
    batchIds: [A.batchId], durationMinutes: 60, windowStart: new Date(now - 3_600_000), windowEnd: new Date(now + 3_600_000), createdBy: A.admin.userId,
  };
  const [test] = await db.insert(tests).values({ ...testBase, title: SECRETS.testTitle, status: "published" }).returning({ id: tests.id });
  const [draftTest] = await db.insert(tests).values({ ...testBase, title: `${SECRETS.testTitle}-DRAFT`, status: "draft" }).returning({ id: tests.id });
  const [att] = await db.insert(attempts).values({
    instituteId: inst, testId: test!.id, studentId: studentUser, status: "in_progress", deadline: new Date(now + 1_800_000), receiptCode: "ALPHA-RECEIPT",
  }).returning({ id: attempts.id });
  await db.insert(attemptAnswers).values({ attemptId: att!.id, questionId: q!.id, instituteId: inst, seq: 1, status: "answered", value: { selected: ["A"], numeric: null } });
  await db.insert(attemptIncidents).values({ attemptId: att!.id, instituteId: inst, type: "tab_hidden", occurredAt: new Date() });

  // evaluation / ranks / result settings / key revision (a second, submitted attempt carries the released result)
  const [test2] = await db.insert(tests).values({ ...testBase, title: `${SECRETS.testTitle}-2`, status: "closed" }).returning({ id: tests.id });
  const [att2] = await db.insert(attempts).values({
    instituteId: inst, testId: test2!.id, studentId: studentUser, status: "submitted", deadline: new Date(now - 60_000), submittedAt: new Date(now - 120_000), receiptCode: "ALPHA-RECEIPT-2",
  }).returning({ id: attempts.id });
  const [ev] = await db.insert(evaluations).values({
    instituteId: inst, attemptId: att2!.id, testId: test2!.id, studentId: studentUser, batchId: A.batchId, version: 1, keyVersion: 1, schemeVersion: 1,
    score: 4, maxScore: 4, correct: 1, incorrect: 0, unanswered: 0, accuracy: 100, sections: [{ sectionId: "S1", score: 4, maxScore: 4, correct: 1, incorrect: 0, partial: 0, unanswered: 0 }],
    isCurrent: true, releasedAt: new Date(now - 60_000),
  }).returning({ id: evaluations.id });
  await db.insert(evaluationItems).values({ evaluationId: ev!.id, instituteId: inst, attemptId: att2!.id, questionId: q!.id, sectionId: "S1", topicId: topic!.id, result: "correct", marks: 4, maxMarks: 4 });
  for (const [scope, scopeId] of [["test", null], ["batch", A.batchId]] as const) {
    await db.insert(rankings).values({ instituteId: inst, testId: test2!.id, scope, scopeId, attemptId: att2!.id, studentId: studentUser, rank: 1, percentile: 100, participants: 1 });
  }
  await db.insert(resultSettings).values({ testId: test2!.id, instituteId: inst, releaseMode: "immediate" });
  await db.insert(answerKeyRevisions).values({ instituteId: inst, testId: test2!.id, keyVersion: 1, questionId: q!.id, change: { correct: ["A"] }, reason: "alpha" });

  // notifications + import job
  const [note] = await db.insert(notifications).values({
    instituteId: inst, userId: studentUser, type: "result_released", channel: "in_app", dedupeKey: "alpha-note-1", title: SECRETS.notification, body: SECRETS.notification,
  }).returning({ id: notifications.id });
  await db.insert(notifications).values({
    instituteId: inst, userId: A.admin.userId, type: "test_scheduled", channel: "in_app", dedupeKey: "alpha-note-2", title: SECRETS.notification, body: SECRETS.notification,
  });
  const [imp] = await db.insert(importJobs).values({
    instituteId: inst, kind: "users", status: "done", filename: SECRETS.importFile, totalRows: 1, failedRows: 1, errors: [{ row: 1, message: "alpha bad row" }],
    csv: "name,email\nAlphaSecret,alpha-secret@alpha.test\n", createdBy: A.admin.userId,
  }).returning({ id: importJobs.id });

  const extras: Extras = {
    questionId: q!.id, rootNodeId: root!.id, topicId: topic!.id, materialId: mat!.id, paperId: paper!.id, draftId: draft!.id,
    testId: test!.id, draftTestId: draftTest!.id, attemptId: att!.id, evaluationId: ev!.id, notificationId: note!.id, importId: imp!.id,
    resultTestId: test2!.id, resultAttemptId: att2!.id, allIds: [],
  };
  extras.allIds = [
    q!.id, root!.id, topic!.id, mat!.id, paper!.id, draft!.id, test!.id, draftTest!.id, att!.id, ev!.id, note!.id, imp!.id, test2!.id, att2!.id,
  ];
  return { ...A, ...extras };
}

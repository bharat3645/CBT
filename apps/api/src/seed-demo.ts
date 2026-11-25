/**
 * Realistic "Demo Academy" dataset: 3 batches, 25 students, 3 teachers, 5 parents, a 60-question tagged bank,
 * 6 tests (4 evaluated, 1 live, 1 upcoming) with attempts, evaluations, ranks and per-topic items, notifications and a
 * couple of flagged papers/attempts. Idempotent: people are upserted by email; the academic data is created only once
 * (marker: the test "JEE Main Mock 1"). Evaluations come from the real marking engine (@cbt/marking), not hand-made numbers.
 * Everything is deterministic (seeded PRNG) except dates, which are relative to "now".
 */
import { createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { DEFAULT_PRESETS } from "@cbt/contracts/exams";
import { questionPayloadSchema, type QuestionPayload } from "@cbt/contracts";
import {
  accounts, attendanceRecords, teacherFeedback, attemptAnswers, attemptIncidents, attempts, batchTeachers, batchTopicProgress, batches, enrolments,
  evaluationItems, evaluations, guardianStudentLinks, guardians, ingestionDrafts, ingestionPapers, memberships, notifications,
  questionTopics, questionVersions, questions, rankings, resultSettings, students, syllabusNodes, teachers, tests, users, type Db,
} from "@cbt/db";
import { computeAllScopes, evaluate, payloadToKey, type Answer, type QuestionKey, type RankEntry } from "@cbt/marking";

import { buildSearchText } from "./modules/questions/question-logic";
import { textToDoc } from "./modules/ingestion/promote-draft";
import { BANK, SYLLABUS, type BankQuestion } from "./seed-demo-bank";

export const DEMO_PASSWORD = "Passw0rd!Passw0rd";
const DAY = 86_400_000;
const MIN = 60_000;

let cachedHash: string | undefined;
export async function ensureUser(db: Db, email: string, name: string, password: string, role?: string) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing.id;
  const [u] = await db.insert(users).values({ email, name, emailVerified: true, role: role ?? null }).returning({ id: users.id });
  const pw = password === DEMO_PASSWORD ? (cachedHash ??= await hash(password)) : await hash(password);
  await db.insert(accounts).values({ accountId: u!.id, providerId: "credential", userId: u!.id, password: pw });
  return u!.id;
}

/** mulberry32: small deterministic PRNG so the dataset is identical on every reset. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const strSeed = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

const BATCHES = [
  { name: "JEE-2026-A", code: "JEE26A", year: 2026 },
  { name: "NEET-2026-B", code: "NEET26B", year: 2026 },
  { name: "Foundation-9", code: "FND9", year: 2026 },
] as const;

const STUDENTS: Record<string, string[]> = {
  "JEE-2026-A": ["Aarav Sharma", "Ishita Verma", "Rohan Mehta", "Ananya Iyer", "Kabir Singh", "Diya Nair", "Arjun Reddy", "Saanvi Gupta", "Vihaan Joshi"],
  "NEET-2026-B": ["Priya Menon", "Aditya Rao", "Meera Pillai", "Karthik Subramanian", "Neha Kapoor", "Rahul Desai", "Sneha Patil", "Tanvi Bhatt"],
  "Foundation-9": ["Yash Malhotra", "Riya Chatterjee", "Dev Agarwal", "Kiara Shah", "Aryan Khanna", "Mira Banerjee", "Pranav Kulkarni"],
};
const ROLL_PREFIX: Record<string, string> = { "JEE-2026-A": "JA", "NEET-2026-B": "NB", "Foundation-9": "F9" };

const TEACHERS = [
  { email: "meera.iyer@demo.test", name: "Dr. Meera Iyer", subject: "Chemistry", batches: ["JEE-2026-A", "NEET-2026-B"], code: "T002", qual: "PhD Chemistry" },
  { email: "rohan.kulkarni@demo.test", name: "Rohan Kulkarni", subject: "Maths", batches: ["JEE-2026-A", "Foundation-9"], code: "T003", qual: "M.Sc Mathematics" },
];
const emailOf = (name: string) => `${name.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, ".")}@demo.test`;

/** [parent name, relation, child name] (parent@demo.test is linked to student@demo.test separately). */
const PARENTS: [string, string, string][] = [
  ["Sunita Sharma", "Mother", "Aarav Sharma"],
  ["Rajesh Iyer", "Father", "Ananya Iyer"],
  ["Lakshmi Menon", "Mother", "Priya Menon"],
  ["Vikram Chatterjee", "Father", "Riya Chatterjee"],
];

interface Person { userId: string; membershipId: string }

async function ensurePerson(db: Db, instituteId: string, email: string, name: string, role: string): Promise<Person> {
  const userId = await ensureUser(db, email, name, DEMO_PASSWORD);
  await db.insert(memberships).values({ organizationId: instituteId, userId, role }).onConflictDoNothing();
  const [m] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.organizationId, instituteId)));
  return { userId, membershipId: m!.id };
}

export async function seedDemoAcademy(db: Db, instituteId: string): Promise<string> {
  // ---- people (always ensured; cheap and idempotent) -------------------------------------------------------------
  const batchRows = new Map<string, string>();
  for (const b of BATCHES) {
    let [row] = await db.select({ id: batches.id }).from(batches).where(and(eq(batches.instituteId, instituteId), eq(batches.name, b.name))).limit(1);
    if (!row) [row] = await db.insert(batches).values({ instituteId, ...b }).returning({ id: batches.id });
    batchRows.set(b.name, row!.id);
  }

  const teacherIds = new Map<string, { userId: string; teacherId: string }>(); // by subject
  const ensureTeacher = async (email: string, name: string, subject: string, code: string, qual: string, bnames: string[]) => {
    const p = await ensurePerson(db, instituteId, email, name, "teacher");
    await db.insert(teachers).values({ instituteId, membershipId: p.membershipId, userId: p.userId, employeeCode: code, qualification: qual }).onConflictDoNothing();
    const [t] = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.membershipId, p.membershipId));
    for (const bn of bnames) await db.insert(batchTeachers).values({ instituteId, batchId: batchRows.get(bn)!, teacherId: t!.id, subject }).onConflictDoNothing();
    teacherIds.set(subject, { userId: p.userId, teacherId: t!.id });
  };
  await ensureTeacher("teacher@demo.test", "Demo Teacher", "Physics", "T001", "M.Sc Physics", ["JEE-2026-A", "NEET-2026-B"]);
  for (const t of TEACHERS) await ensureTeacher(t.email, t.name, t.subject, t.code, t.qual, t.batches);

  const studentByName = new Map<string, { userId: string; studentId: string; batch: string; name: string }>();
  const ensureStudent = async (email: string, name: string, batch: string, roll: string | null) => {
    const p = await ensurePerson(db, instituteId, email, name, "student");
    await db.insert(students).values({ instituteId, membershipId: p.membershipId, userId: p.userId, rollNo: roll }).onConflictDoNothing();
    const [s] = await db.select({ id: students.id }).from(students).where(eq(students.membershipId, p.membershipId));
    await db.insert(enrolments).values({ instituteId, batchId: batchRows.get(batch)!, studentId: s!.id }).onConflictDoNothing();
    const info = { userId: p.userId, studentId: s!.id, batch, name };
    studentByName.set(name, info);
    return info;
  };
  await ensureStudent("student@demo.test", "Demo Student", "JEE-2026-A", "R001");
  for (const [batch, names] of Object.entries(STUDENTS)) {
    let i = 1;
    for (const n of names) await ensureStudent(emailOf(n), n, batch, `${ROLL_PREFIX[batch]}${String(i++).padStart(3, "0")}`);
  }

  const ensureGuardian = async (email: string, name: string, relation: string, child: string) => {
    const p = await ensurePerson(db, instituteId, email, name, "parent");
    await db.insert(guardians).values({ instituteId, membershipId: p.membershipId, userId: p.userId, relation }).onConflictDoNothing();
    const [g] = await db.select({ id: guardians.id }).from(guardians).where(eq(guardians.membershipId, p.membershipId));
    await db.insert(guardianStudentLinks).values({ instituteId, guardianId: g!.id, studentId: studentByName.get(child)!.studentId, status: "verified", verifiedAt: new Date() }).onConflictDoNothing();
    return p.userId;
  };
  const parentUserOf = new Map<string, string>(); // child name -> parent user id
  parentUserOf.set("Demo Student", await ensureGuardian("parent@demo.test", "Demo Parent", "Mother", "Demo Student"));
  for (const [pn, rel, child] of PARENTS) parentUserOf.set(child, await ensureGuardian(emailOf(pn), pn, rel, child));

  const adminP = await ensurePerson(db, instituteId, "admin@demo.test", "Demo Admin", "institute_admin");

  // ---- academic data (once) ----------------------------------------------------------------------------------------
  const [marker] = await db.select({ id: tests.id }).from(tests).where(and(eq(tests.instituteId, instituteId), eq(tests.title, "JEE Main Mock 1"))).limit(1);
  if (marker) return "people ensured; academic data already present (run `pnpm demo:reset` for a clean slate)";

  const now = Date.now();
  const rand = rng(20260);

  // syllabus tree (institute-owned) + topic lookup
  const topicId = new Map<string, string>();
  const topicOrder: string[] = [];
  const [exam] = await db.insert(syllabusNodes).values({ instituteId, level: "exam", name: "JEE Main 2026", position: 0 }).returning({ id: syllabusNodes.id });
  let sp = 0;
  for (const [subject, units] of Object.entries(SYLLABUS)) {
    const [sn] = await db.insert(syllabusNodes).values({ instituteId, parentId: exam!.id, level: "subject", name: subject, position: sp++ }).returning({ id: syllabusNodes.id });
    let up = 0;
    for (const [unit, chapters] of Object.entries(units)) {
      const [un] = await db.insert(syllabusNodes).values({ instituteId, parentId: sn!.id, level: "unit", name: unit, position: up++ }).returning({ id: syllabusNodes.id });
      let cp = 0;
      for (const [chapter, tps] of Object.entries(chapters)) {
        const [cn] = await db.insert(syllabusNodes).values({ instituteId, parentId: un!.id, level: "chapter", name: chapter, position: cp++ }).returning({ id: syllabusNodes.id });
        let tp = 0;
        for (const t of tps) {
          const [tn] = await db.insert(syllabusNodes).values({ instituteId, parentId: cn!.id, level: "topic", name: t, position: tp++ }).returning({ id: syllabusNodes.id });
          topicId.set(t, tn!.id);
          topicOrder.push(t);
        }
      }
    }
  }

  // question bank
  const author: Record<string, string> = { Physics: teacherIds.get("Physics")!.userId, Chemistry: teacherIds.get("Chemistry")!.userId, Maths: teacherIds.get("Maths")!.userId };
  interface Q { id: string; code: string; bank: BankQuestion; payload: QuestionPayload; topicId: string }
  const bank: Q[] = [];
  let n = 0;
  for (const b of BANK) {
    n++;
    const tid = topicId.get(b.topic);
    if (!tid) throw new Error(`Bank topic "${b.topic}" is not in the syllabus tree`);
    const common = { stem: textToDoc(b.stem), difficulty: b.difficulty, marks: 4, negativeMarks: 1, topicIds: [tid] };
    const payload = questionPayloadSchema.parse(
      b.options
        ? { ...common, type: "mcq_single", options: b.options.map((o, i) => ({ id: "ABCD"[i]!, content: textToDoc(o) })), correct: ["ABCD"[b.correct!]!] }
        : { ...common, type: "numeric", numeric: { answer: b.numeric!, tolerance: 0, toleranceKind: "absolute" } },
    );
    const [q] = await db.insert(questions).values({
      instituteId, code: `Q${n}`, type: payload.type, difficulty: payload.difficulty, searchText: buildSearchText(payload), createdBy: author[b.subject],
      createdAt: new Date(now - (60 - n) * DAY / 3),
    }).returning({ id: questions.id });
    await db.insert(questionVersions).values({ instituteId, questionId: q!.id, version: 1, payload, createdBy: author[b.subject] });
    await db.insert(questionTopics).values({ questionId: q!.id, topicId: tid, instituteId });
    bank.push({ id: q!.id, code: `Q${n}`, bank: b, payload, topicId: tid });
  }
  const bySubject = (s: string) => bank.filter((q) => q.bank.subject === s);
  const pick = (s: string, from: number, to: number) => bySubject(s).slice(from, to);

  // ---- tests ---------------------------------------------------------------------------------------------------------
  const JEE = batchRows.get("JEE-2026-A")!, NEET = batchRows.get("NEET-2026-B")!, FND = batchRows.get("Foundation-9")!;
  const T0 = new Date(now);
  const at = (daysFromNow: number, hour: number, minute = 0) => {
    const d = new Date(T0.getTime() + daysFromNow * DAY);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  interface TestDef {
    title: string; preset: "nta" | "private_mcq" | "practice"; batchIds: string[]; sections: { name: string; qs: Q[] }[];
    duration: number; start: Date; end: Date; kind: "done" | "live" | "upcoming"; teacher: string; instructions: string;
  }
  const defs: TestDef[] = [
    {
      title: "JEE Main Mock 1", preset: "nta", batchIds: [JEE], duration: 90, start: at(-25, 10), end: at(-25, 13), kind: "done", teacher: "Physics",
      sections: [{ name: "Physics", qs: pick("Physics", 0, 10) }, { name: "Chemistry", qs: pick("Chemistry", 0, 10) }, { name: "Mathematics", qs: pick("Maths", 0, 10) }],
      instructions: "Each correct answer carries +4 marks and each wrong answer -1.",
    },
    {
      title: "Physics Sectional: Mechanics and Electricity", preset: "nta", batchIds: [JEE, NEET], duration: 45, start: at(-12, 16), end: at(-12, 19), kind: "done", teacher: "Physics",
      sections: [{ name: "Physics", qs: pick("Physics", 5, 17) }],
      instructions: "Single-subject sectional test. Calculators are not allowed.",
    },
    {
      title: "JEE Main Mock 2", preset: "nta", batchIds: [JEE, NEET], duration: 90, start: at(-5, 10), end: at(-5, 13), kind: "done", teacher: "Chemistry",
      sections: [{ name: "Physics", qs: pick("Physics", 10, 20) }, { name: "Chemistry", qs: pick("Chemistry", 10, 20) }, { name: "Mathematics", qs: pick("Maths", 10, 20) }],
      instructions: "Full-length mock in the NTA pattern. Do not leave full-screen mode.",
    },
    {
      title: "Foundation Maths Practice Test 1", preset: "practice", batchIds: [FND], duration: 40, start: at(-3, 15), end: at(-3, 20), kind: "done", teacher: "Maths",
      sections: [{ name: "Mathematics", qs: pick("Maths", 0, 10) }],
      instructions: "Practice test: explanations are shown after each question and nothing is negatively marked.",
    },
    {
      title: "Weekly Test: Mechanics and Calculus", preset: "nta", batchIds: [JEE, NEET], duration: 40, kind: "live", teacher: "Physics",
      start: new Date(now - 2 * 60 * MIN), end: new Date(now + 22 * 60 * MIN),
      sections: [{ name: "Physics", qs: pick("Physics", 0, 8) }, { name: "Mathematics", qs: pick("Maths", 3, 9) }],
      instructions: "Open for 24 hours. You get 40 minutes once you start.",
    },
    {
      title: "JEE Main Mock 3", preset: "nta", batchIds: [JEE], duration: 90, start: at(5, 10), end: at(5, 13), kind: "upcoming", teacher: "Physics",
      sections: [{ name: "Physics", qs: [...pick("Physics", 0, 4), ...pick("Physics", 12, 16)] }, { name: "Chemistry", qs: [...pick("Chemistry", 3, 7), ...pick("Chemistry", 12, 16)] }, { name: "Mathematics", qs: [...pick("Maths", 3, 7), ...pick("Maths", 12, 16)] }],
      instructions: "Full syllabus mock. Strict mode is on: leaving full-screen counts as an incident.",
    },
  ];

  interface Built { def: TestDef; id: string; keys: QuestionKey[]; flat: { q: Q; section: string }[]; paperId: string }
  const built: Built[] = [];
  for (const def of defs) {
    const config = DEFAULT_PRESETS[def.preset].config;
    const sections = def.sections.map((s) => ({ name: s.name, questionIds: s.qs.map((q) => q.id) }));
    const flat = def.sections.flatMap((s) => s.qs.map((q) => ({ q, section: s.name })));
    const creator = teacherIds.get(def.teacher)!.userId;

    // approved paper (frozen) with one draft per question, so the paper list/detail look real
    const answerKey: Record<string, string> = {};
    flat.forEach(({ q }, i) => { answerKey[String(i + 1)] = q.bank.options ? "ABCD"[q.bank.correct!]! : String(q.bank.numeric); });
    const [paper] = await db.insert(ingestionPapers).values({
      instituteId, title: `${def.title} (paper)`, filename: `${def.title.replace(/\W+/g, "-").toLowerCase()}.docx`,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      storageKey: `demo/${def.title.replace(/\W+/g, "-").toLowerCase()}.docx`, sha256: createHash("sha256").update(def.title).digest("hex"),
      sizeBytes: 38_000 + Math.floor(rand() * 20_000), scanStatus: "clean", status: "approved", answerKey, frozenVersion: 1,
      approvedBy: creator, approvedAt: new Date(def.start.getTime() - 3 * DAY), createdBy: creator, createdAt: new Date(def.start.getTime() - 4 * DAY),
    }).returning({ id: ingestionPapers.id });
    await db.insert(ingestionDrafts).values(flat.map(({ q, section }, i) => ({
      instituteId, paperId: paper!.id, number: i + 1, ordinal: i, section, type: (q.bank.options ? "mcq" : "numeric") as "mcq" | "numeric",
      stem: q.bank.stem, options: (q.bank.options ?? []).map((t, k) => ({ label: "ABCD"[k]!, text: t })), answer: answerKey[String(i + 1)]!,
      confidence: 0.9 + Math.round(rand() * 9) / 100, label: "EXTRACTED" as const, flags: [],
      source: { page: 1 + Math.floor(i / 4), bbox: null, blockStart: i * 3, blockEnd: i * 3 + 2 }, questionId: q.id,
    })));

    const [t] = await db.insert(tests).values({
      instituteId, paperId: paper!.id, title: def.title, presetKey: def.preset, config, sections, batchIds: def.batchIds,
      durationMinutes: def.duration, windowStart: def.start, windowEnd: def.end, instructions: def.instructions,
      status: def.kind === "done" ? "closed" : "published", createdBy: creator, createdAt: new Date(def.start.getTime() - 3 * DAY),
    }).returning({ id: tests.id });

    const scheme = { correct: config.marking.correct, wrong: config.marking.wrong };
    const keys: QuestionKey[] = [];
    for (const { q, section } of flat) {
      const k = payloadToKey(q.id, section, { ...q.payload, topicIds: [q.topicId] } as never, scheme);
      if (k) keys.push(k);
    }
    built.push({ def, id: t!.id, keys, flat, paperId: paper!.id });
  }

  // ---- attempts + evaluations (real marking engine) -----------------------------------------------------------
  const everyone = [...studentByName.values()];
  const ability = new Map<string, number>(); // per student
  const subjectBias = new Map<string, number>();
  for (const s of everyone) {
    const r = rng(strSeed(s.name));
    ability.set(s.name, s.name === "Demo Student" ? 0.74 : 0.42 + r() * 0.48);
    for (const subj of ["Physics", "Chemistry", "Maths"]) subjectBias.set(`${s.name}|${subj}`, (r() - 0.5) * 0.22);
  }
  const topicNoise = (name: string, topic: string) => (rng(strSeed(name + topic))() - 0.5) * 0.24;
  // The demo student is clearly weaker at a few topics, so "weak topics" and recommendations have a story.
  const WEAK = new Set(["Inductive and resonance effects", "Reaction intermediates", "Friction", "Area under curves"]);
  const DIFF_PENALTY = { easy: -0.08, medium: 0.08, hard: 0.3 } as const;

  const rankEntries = new Map<string, RankEntry[]>();
  const evalInfo: { testIdx: number; userId: string; name: string; evId: string; score: number; max: number; released: Date }[] = [];
  const incidentPlan = new Set(["Rohan Mehta|JEE Main Mock 1", "Kabir Singh|JEE Main Mock 2", "Aditya Rao|JEE Main Mock 2", "Neha Kapoor|Physics Sectional: Mechanics and Electricity"]);

  for (let ti = 0; ti < built.length; ti++) {
    const b = built[ti]!;
    const { def } = b;
    const participants = everyone.filter((s) => def.batchIds.includes(batchRows.get(s.batch)!));
    const durSec = def.duration * 60;
    const entries: RankEntry[] = [];

    for (const s of participants) {
      if (def.kind === "upcoming") continue;
      const absent = s.name !== "Demo Student" && rand() < 0.1;
      if (absent) continue;
      const progress = ti * 0.02; // students improve a little over time
      const answers: Answer[] = [];
      const rowsToSave: { questionId: string; status: string; value: object; timeMs: number }[] = [];
      let usedSec = 0;

      if (def.kind === "live") {
        // Only a few students are mid-exam right now, answering the first handful of questions.
        if (!["Aarav Sharma", "Ishita Verma", "Priya Menon"].includes(s.name)) continue;
        const started = new Date(now - (8 + Math.floor(rand() * 8)) * MIN);
        const [att] = await db.insert(attempts).values({
          instituteId, testId: b.id, studentId: s.userId, status: "in_progress", startedAt: started,
          deadline: new Date(started.getTime() + def.duration * MIN),
        }).returning({ id: attempts.id });
        const done = b.flat.slice(0, 4 + Math.floor(rand() * 4));
        await db.insert(attemptAnswers).values(done.map(({ q }, i) => ({
          attemptId: att!.id, questionId: q.id, instituteId, seq: i + 1, status: "answered",
          value: q.bank.options ? { selected: [("ABCD")[Math.floor(rand() * 4)]!], numeric: null } : { selected: [], numeric: String(q.bank.numeric) },
          timeSpentMs: 45_000 + Math.floor(rand() * 90_000),
        })));
        continue;
      }

      const attemptRate = 0.82 + rand() * 0.16;
      for (const { q, section } of b.flat) {
        const subj = q.bank.subject;
        let p = (ability.get(s.name) ?? 0.6) + (subjectBias.get(`${s.name}|${subj}`) ?? 0) + topicNoise(s.name, q.bank.topic) + progress - DIFF_PENALTY[q.bank.difficulty] * 0.6;
        if (s.name === "Demo Student" && WEAK.has(q.bank.topic)) p -= 0.38;
        p = Math.min(0.97, Math.max(0.08, p));
        const spent = Math.max(15, Math.round((durSec / b.flat.length) * (0.45 + rand() * 0.5)));
        void section;
        if (rand() > attemptRate) {
          answers.push({ questionId: q.id, selected: [], numeric: null, timeSpentSec: Math.round(spent * 0.3) });
          rowsToSave.push({ questionId: q.id, status: rand() < 0.3 ? "marked" : "not_answered", value: { selected: [], numeric: null }, timeMs: Math.round(spent * 300) });
          usedSec += Math.round(spent * 0.3);
          continue;
        }
        const right = rand() < p;
        if (q.bank.options) {
          const correct = "ABCD"[q.bank.correct!]!;
          const sel = right ? correct : "ABCD".replace(correct, "")[Math.floor(rand() * 3)]!;
          answers.push({ questionId: q.id, selected: [sel], timeSpentSec: spent });
          rowsToSave.push({ questionId: q.id, status: rand() < 0.1 ? "answered_marked" : "answered", value: { selected: [sel], numeric: null }, timeMs: spent * 1000 });
        } else {
          const given = right ? q.bank.numeric! : q.bank.numeric! + (rand() < 0.5 ? 1 : -2) * (1 + Math.floor(rand() * 3));
          answers.push({ questionId: q.id, selected: [], numeric: given, timeSpentSec: spent });
          rowsToSave.push({ questionId: q.id, status: "answered", value: { selected: [], numeric: String(given) }, timeMs: spent * 1000 });
        }
        usedSec += spent;
      }
      usedSec = Math.min(usedSec, Math.round(durSec * 0.98));
      const started = new Date(def.start.getTime() + Math.floor(rand() * Math.max(1, (def.end.getTime() - def.start.getTime() - def.duration * MIN) / MIN)) * MIN);
      const submittedAt = new Date(started.getTime() + usedSec * 1000);
      const needsIncident = incidentPlan.has(`${s.name}|${def.title}`);
      const [att] = await db.insert(attempts).values({
        instituteId, testId: b.id, studentId: s.userId, status: "submitted", startedAt: started, deadline: new Date(started.getTime() + def.duration * MIN),
        submittedAt, receiptCode: createHash("sha256").update(`${s.userId}:${b.id}`).digest("hex").slice(0, 12).toUpperCase(),
        incidentCount: needsIncident ? 3 : 0, flagged: needsIncident && s.name === "Kabir Singh",
      }).returning({ id: attempts.id });
      await db.insert(attemptAnswers).values(rowsToSave.map((r, i) => ({
        attemptId: att!.id, questionId: r.questionId, instituteId, seq: i + 1, status: r.status, value: r.value, timeSpentMs: r.timeMs,
      })));
      if (needsIncident) {
        await db.insert(attemptIncidents).values(["tab_hidden", "fullscreen_exit", "tab_hidden"].map((type, i) => ({
          attemptId: att!.id, instituteId, type, occurredAt: new Date(started.getTime() + (12 + i * 17) * MIN), durationMs: 4000 + i * 3500, detail: "Left the exam tab",
        })));
      }

      const ev = evaluate({ attemptId: att!.id, keyVersion: 1, schemeVersion: 1, version: 1, questions: b.keys, answers });
      const released = new Date(def.end.getTime() + 60 * MIN);
      const [evRow] = await db.insert(evaluations).values({
        instituteId, attemptId: att!.id, testId: b.id, studentId: s.userId, batchId: batchRows.get(s.batch)!, attemptNo: 1, version: 1,
        keyVersion: 1, schemeVersion: 1, score: ev.score, maxScore: ev.maxScore, correct: ev.correct, incorrect: ev.incorrect, partial: ev.partial,
        unanswered: ev.unanswered, accuracy: ev.accuracy, timeSpentSec: ev.timeSpentSec, sections: ev.sections, isCurrent: true,
        releasedAt: released, evaluatedAt: released,
      }).returning({ id: evaluations.id });
      await db.insert(evaluationItems).values(ev.items.map((i) => ({
        evaluationId: evRow!.id, instituteId, attemptId: att!.id, questionId: i.questionId, sectionId: i.sectionId, topicId: i.topicId,
        result: i.result, marks: i.marks, maxMarks: i.maxMarks, timeSpentSec: i.timeSpentSec,
      })));
      entries.push({
        attemptId: att!.id, studentId: s.userId, batchId: batchRows.get(s.batch)!, attemptNo: 1, score: ev.score, incorrect: ev.incorrect,
        section1Score: ev.sections[0]?.score ?? 0, timeSpentSec: ev.timeSpentSec,
      });
      evalInfo.push({ testIdx: ti, userId: s.userId, name: s.name, evId: evRow!.id, score: ev.score, max: ev.maxScore, released });
    }

    if (def.kind === "upcoming" || def.kind === "live") {
      await db.insert(resultSettings).values({ testId: b.id, instituteId, releaseMode: "immediate", tieBreakers: ["fewer_incorrect", "less_time"], minPercentileParticipants: 10 });
      continue;
    }
    await db.insert(resultSettings).values({ testId: b.id, instituteId, releaseMode: "immediate", tieBreakers: ["fewer_incorrect", "less_time"], minPercentileParticipants: 10 });
    const rows = computeAllScopes(entries, { tieBreakers: ["fewer_incorrect", "less_time"], minParticipantsForPercentile: 10 });
    if (rows.length) {
      await db.insert(rankings).values(rows.map((r) => ({
        instituteId, testId: b.id, scope: r.scope, scopeId: r.scopeId, attemptId: r.attemptId, studentId: r.studentId,
        rank: r.rank, percentile: r.percentile, participants: r.participants, computedAt: built[ti]!.def.end,
      })));
    }
    rankEntries.set(b.id, entries);
  }

  // ---- papers awaiting review (with flags) ---------------------------------------------------------------------------
  const phys = teacherIds.get("Physics")!.userId, chem = teacherIds.get("Chemistry")!.userId, maths = teacherIds.get("Maths")!.userId;
  const reviewPaper = async (title: string, by: string, ageDays: number, drafts: { stem: string; opts: string[]; ans: string | null; conf: number; flags?: { code: string; message: string; severity: "error" | "warning" }[]; label?: "EXTRACTED" | "AI-INFERRED" }[], key: Record<string, string>) => {
    const [p] = await db.insert(ingestionPapers).values({
      instituteId, title, filename: `${title.replace(/\W+/g, "-").toLowerCase()}.pdf`, mimeType: "application/pdf",
      storageKey: `demo/${title.replace(/\W+/g, "-").toLowerCase()}.pdf`, sha256: createHash("sha256").update(title).digest("hex"), sizeBytes: 214_000,
      scanStatus: "clean", status: "review", answerKey: key, createdBy: by, createdAt: new Date(now - ageDays * DAY),
    }).returning({ id: ingestionPapers.id });
    await db.insert(ingestionDrafts).values(drafts.map((d, i) => ({
      instituteId, paperId: p!.id, number: i + 1, ordinal: i, section: null, type: "mcq" as const, stem: d.stem,
      options: d.opts.map((t, k) => ({ label: "ABCD"[k]!, text: t })), answer: d.ans, confidence: d.conf, label: d.label ?? ("EXTRACTED" as const),
      flags: (d.flags ?? []).map((f) => ({ ...f, resolved: false })), source: { page: 1 + Math.floor(i / 3), bbox: null, blockStart: i * 3, blockEnd: i * 3 + 2 },
    })));
  };
  await reviewPaper("Chemistry Unit Test: Organic (scanned)", chem, 3, [
    { stem: "Which of the following is the most stable carbocation?", opts: ["Methyl", "Primary", "Secondary", "Tertiary"], ans: "D", conf: 0.97 },
    { stem: "The IUPAC name of $\\text{CH}_3\\text{CH}(\\text{OH})\\text{CH}_3$ is", opts: ["Propan-1-ol", "Propan-2-ol"], ans: "B", conf: 0.71, flags: [{ code: "TOO_FEW_OPTIONS", message: "Only 2 options detected (expected 4)", severity: "error" }] },
    { stem: "Hyperconjugation involves the delocalisation of", opts: [], ans: null, conf: 0.52, flags: [{ code: "NO_OPTIONS", message: "No options found for this question", severity: "error" }, { code: "MISSING_KEY", message: "No answer in the key", severity: "error" }], label: "AI-INFERRED" },
    { stem: "Markovnikov's rule applies to the addition of HBr to", opts: ["Ethene", "Propene", "Benzene", "Ethyne"], ans: "B", conf: 0.94, flags: [{ code: "NUMBER_GAP", message: "Question numbering skips from 3 to 5", severity: "warning" }] },
  ], { "1": "D", "2": "B", "4": "B" });
  await reviewPaper("Maths Practice Set 4", maths, 1, [
    { stem: "$\\displaystyle\\int_0^1 x^2\\,dx$ equals", opts: ["$1/2$", "$1/3$", "$1/4$", "$1$"], ans: "B", conf: 0.98 },
    { stem: "The derivative of $\\cos x$ is", opts: ["$\\sin x$", "$-\\sin x$", "$\\cos x$", "$-\\cos x$"], ans: "B", conf: 0.99 },
    { stem: "The roots of $x^2 - 1 = 0$ are", opts: ["$\\pm 1$", "$0, 1$", "$1, 2$", "$-1, 0$"], ans: "A", conf: 0.96 },
  ], { "1": "B", "2": "B", "3": "A" });
  void phys;

  // ---- syllabus progress per batch ------------------------------------------------------------------------------------
  const pct: Record<string, number> = { [JEE]: 0.75, [NEET]: 0.5, [FND]: 0.3 };
  for (const [bid, share] of Object.entries(pct)) {
    const done = Math.round(topicOrder.length * share);
    await db.insert(batchTopicProgress).values(topicOrder.map((t, i) => ({
      instituteId, batchId: bid, topicId: topicId.get(t)!,
      status: (i < done ? "completed" : i === done ? "in_progress" : "not_started") as "completed" | "in_progress" | "not_started",
      note: i === done ? "Currently teaching" : null, completedAt: i < done ? new Date(now - (done - i + 3) * 2 * DAY) : null,
    })));
  }

  // ---- attendance history (last 3 weeks of weekdays) and a few teacher feedback notes ------------------------------------
  {
    const rows: (typeof attendanceRecords.$inferInsert)[] = [];
    const markedBy = teacherIds.get("Physics")!.userId;
    for (const s of everyone) {
      let n = 0;
      for (let d = 1; d <= 21; d++) {
        const day = new Date(now - d * DAY);
        if (day.getDay() === 0 || day.getDay() === 6) continue;
        n++;
        const h = createHash("md5").update(`${s.name}:${d}`).digest()[0]! / 255; // deterministic, so resets look the same
        const demo = s.name === "Demo Student";
        const status = demo ? (n === 4 ? "absent" : n === 9 ? "late" : "present") : h < 0.07 ? "absent" : h < 0.13 ? "late" : h < 0.16 ? "excused" : "present";
        rows.push({ instituteId, batchId: batchRows.get(s.batch)!, studentUserId: s.userId, onDate: day.toISOString().slice(0, 10), status, markedBy });
      }
    }
    for (let i = 0; i < rows.length; i += 300) await db.insert(attendanceRecords).values(rows.slice(i, i + 300)).onConflictDoNothing();
    const demoStudent = studentByName.get("Demo Student");
    const notes: [string, string][] = [
      ["Physics", "Strong on kinematics and Newton's laws. Spend 20 minutes a day on electrostatics problems: Coulomb's law and capacitors are where marks are slipping."],
      ["Chemistry", "Good numerical accuracy in thermodynamics. Revise inductive and resonance effects, and practise hybridisation questions from the bank."],
      ["Maths", "Calculus is improving. Focus on area under curves and definite integrals before Mock 3."],
    ];
    if (demoStudent) for (const [subj, body] of notes) {
      const t = teacherIds.get(subj);
      if (!t) continue;
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, t.userId)).limit(1);
      await db.insert(teacherFeedback).values({ instituteId, studentUserId: demoStudent.userId, authorId: t.userId, authorName: u?.name ?? `${subj} teacher`, body });
    }
  }

  // ---- notifications ----------------------------------------------------------------------------------------------------
  const notif: (typeof notifications.$inferInsert)[] = [];
  const add = (userId: string, type: string, key: string, title: string, body: string, createdAt: Date, unread: boolean, data: object = {}) =>
    notif.push({
      instituteId, userId, type, channel: "in_app", dedupeKey: `demo:${type}:${key}:${userId}`, title, body, data, status: "sent", sentAt: createdAt,
      createdAt, readAt: unread ? null : new Date(createdAt.getTime() + 3 * 60 * MIN),
    });
  const latestEvalTest = Math.max(...evalInfo.filter((e) => e.name === "Demo Student").map((e) => e.testIdx));
  for (const e of evalInfo) {
    const t = built[e.testIdx]!.def;
    const mine = e.name === "Demo Student";
    add(e.userId, "result_released", `${built[e.testIdx]!.id}`, `Your result for "${t.title}" is ready`, `Score ${e.score} / ${e.max}`, e.released, mine && e.testIdx === latestEvalTest, { testId: built[e.testIdx]!.id });
    const parent = parentUserOf.get(e.name);
    if (parent) add(parent, "result_released", `${built[e.testIdx]!.id}:${e.userId}`, `${e.name} scored ${e.score} / ${e.max} in "${t.title}"`, "Open the child dashboard for the section-wise report.", e.released, e.testIdx >= latestEvalTest);
  }
  const jeeNeetStudents = everyone.filter((s) => s.batch !== "Foundation-9");
  for (const s of jeeNeetStudents) {
    add(s.userId, "test_scheduled", `live:${built[4]!.id}`, 'Weekly Test: Mechanics and Calculus is open', "Available for the next 22 hours. You get 40 minutes once you start.", new Date(now - 2 * 60 * MIN), s.name === "Demo Student", { testId: built[4]!.id });
    if (s.batch === "JEE-2026-A") add(s.userId, "test_scheduled", `up:${built[5]!.id}`, "JEE Main Mock 3 is scheduled", `Opens ${built[5]!.def.start.toDateString()}, 10:00. Strict mode is on.`, new Date(now - 6 * 60 * MIN), s.name === "Demo Student", { testId: built[5]!.id });
  }
  add(teacherIds.get("Physics")!.userId, "paper_flagged", "chem-organic", 'Paper "Chemistry Unit Test: Organic (scanned)" needs review', "3 flags are open and 2 answers are missing.", new Date(now - 3 * 60 * MIN), true);
  add(teacherIds.get("Physics")!.userId, "attempt_flagged", "kabir", "Strict-mode flag in JEE Main Mock 2", "Kabir Singh left full-screen 3 times.", new Date(now - 5 * DAY + 3 * 60 * MIN), false);
  add(adminP.userId, "paper_flagged", "chem-organic", "2 papers are waiting for approval", "One has open flags and a missing answer key.", new Date(now - 3 * 60 * MIN), true);
  add(adminP.userId, "result_released", "mock2-summary", 'Results for "JEE Main Mock 2" are published', "Ranks and the batch report are ready.", built[2]!.def.end, false);
  for (let i = 0; i < notif.length; i += 200) await db.insert(notifications).values(notif.slice(i, i + 200)).onConflictDoNothing();

  const nEval = evalInfo.length;
  return `academic data created: ${bank.length} questions, ${built.length} tests, ${nEval} evaluated attempts, ${notif.length} notifications`;
}

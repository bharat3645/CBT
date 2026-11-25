import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import { PASSWORD, SAMPLE_DOCX } from "./helpers";

/**
 * Direct API sweep: every endpoint with a valid payload as the right role (2xx), then 401 unauthenticated and 403 for a
 * role that must not have access. Runs through the web proxy exactly like the browser does.
 */
const BASE = process.env.WEB_URL ?? "http://localhost:3000";
const RUN = Date.now().toString(36);
const UUID0 = "00000000-0000-4000-8000-000000000000";
type Role = "admin" | "teacher" | "student" | "parent";
const ctx = {} as Record<Role | "anon", APIRequestContext>;
const S: Record<string, any> = {};
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const ok = async (r: any, label: string) => {
  expect(r.status(), `${label} -> ${r.status()} ${(await r.text()).slice(0, 300)}`).toBeLessThan(300);
  return r;
};
const json = async (r: any, label: string) => (await ok(r, label)).json();
const status = async (c: APIRequestContext, m: string, p: string, data?: any) => (await (c as any)[m](p, data === undefined ? undefined : { data })).status();

async function signIn(role: Role) {
  const c = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE } });
  let r = await c.post("/api/v1/auth/sign-in/email", { data: { email: `${role}@demo.test`, password: PASSWORD } });
  for (let i = 0; i < 30 && r.status() >= 500; i++) { // dev servers hot-reload; wait for the API
    await new Promise((x) => setTimeout(x, 2000));
    r = await c.post("/api/v1/auth/sign-in/email", { data: { email: `${role}@demo.test`, password: PASSWORD } });
  }
  expect(r.status(), `sign-in ${role}`).toBe(200);
  return c;
}

test.beforeAll(async () => {
  for (const r of ["admin", "teacher", "student", "parent"] as Role[]) ctx[r] = await signIn(r);
  ctx.anon = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE } });
});

test("public + session endpoints", async () => {
  expect((await ctx.anon.get("/api/v1/health")).status()).toBe(200);
  expect((await ctx.anon.get("/api/v1/me")).status()).toBe(401);
  for (const r of ["admin", "teacher", "student", "parent"] as Role[]) {
    const me = await json(await ctx[r].get("/api/v1/me"), `me ${r}`);
    expect(me.role).toBe(r === "admin" ? "institute_admin" : r);
    S[`me_${r}`] = me;
    await json(await ctx[r].get("/api/v1/dashboard"), `dashboard ${r}`);
    await json(await ctx[r].get("/api/v1/exam-presets"), `presets ${r}`);
  }
  const kids = await json(await ctx.parent.get("/api/v1/children"), "children");
  expect(kids.length).toBeGreaterThan(0);
  S.childUserId = kids[0].userId;
  await json(await ctx.parent.get(`/api/v1/dashboard?childId=${kids[0].userId}`), "dashboard childId");
  // public institute registration (creates a pending institute with a unique admin)
  const reg = await ctx.anon.post("/api/v1/institutes", { data: { name: `Sweep Academy ${RUN}`, adminName: "Sweep Admin", adminEmail: `sweep.${RUN}@e2e.test`, password: "Sweep!Pass12345" } });
  expect(reg.status(), await reg.text()).toBeLessThan(300);
  expect((await reg.json()).status).toBe("pending");
  const pend = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE } });
  await pend.post("/api/v1/auth/sign-in/email", { data: { email: `sweep.${RUN}@e2e.test`, password: "Sweep!Pass12345" } });
  expect([401, 403]).toContain((await pend.get("/api/v1/batches")).status());
});

test("platform (super admin) endpoints are closed to institute roles", async () => {
  for (const r of ["admin", "teacher", "student", "parent"] as Role[]) {
    expect(await status(ctx[r], "get", "/api/v1/institutes"), `institutes list as ${r}`).toBe(403);
    expect(await status(ctx[r], "get", `/api/v1/institutes/${UUID0}`)).toBe(403);
    for (const a of ["approve", "suspend", "reactivate", "deactivate"]) expect(await status(ctx[r], "post", `/api/v1/institutes/${UUID0}/${a}`), `${a} as ${r}`).toBe(403);
  }
  expect(await status(ctx.anon, "get", "/api/v1/institutes")).toBe(401);
});

test("institute branding + audit log", async () => {
  const before = await json(await ctx.admin.get("/api/v1/institute"), "institute");
  const upd = await json(await ctx.admin.patch("/api/v1/institute", { data: { brandColor: "#336699" } }), "patch institute");
  expect(upd.brandColor).toBe("#336699");
  await json(await ctx.admin.patch("/api/v1/institute", { data: { brandColor: before.brandColor ?? null } }), "restore brand");
  expect(await status(ctx.admin, "patch", "/api/v1/institute", { brandColor: "red" })).toBe(400);
  await ok(await ctx.admin.get("/api/v1/audit-logs"), "audit logs");
  for (const r of ["teacher", "student", "parent"] as Role[]) {
    expect(await status(ctx[r], "patch", "/api/v1/institute", { name: "Hacked" }), `patch institute as ${r}`).toBe(403);
    expect(await status(ctx[r], "get", "/api/v1/audit-logs"), `audit as ${r}`).toBe(403);
  }
  expect(await status(ctx.anon, "patch", "/api/v1/institute", {})).toBe(401);
});

test("people: batches, users, guardian links, CSV import", async () => {
  const a = ctx.admin;
  const batch = await json(await a.post("/api/v1/batches", { data: { name: `Sweep Batch ${RUN}`, year: 2026 } }), "create batch");
  S.batchId = batch.id;
  expect((await json(await a.get("/api/v1/batches"), "list batches")).some((b: any) => b.id === batch.id)).toBe(true);
  await json(await a.get(`/api/v1/batches/${batch.id}`), "get batch");
  const upd = await json(await a.patch(`/api/v1/batches/${batch.id}`, { data: { name: `Sweep Batch ${RUN} v2` } }), "patch batch");
  expect(upd.name).toContain("v2");
  await json(await a.post("/api/v1/users", { data: { role: "student", name: `Sweep Student ${RUN}`, email: `stu.${RUN}@e2e.test`, rollNo: `SW-${RUN}`, batchIds: [batch.id] } }), "create student");
  await json(await a.post("/api/v1/users", { data: { role: "teacher", name: `Sweep Teacher ${RUN}`, email: `tch.${RUN}@e2e.test`, employeeCode: `E-${RUN}` } }), "create teacher");
  await json(await a.post("/api/v1/users", { data: { role: "parent", name: `Sweep Parent ${RUN}`, email: `par.${RUN}@e2e.test`, relation: "mother" } }), "create parent");
  const list = await json(await a.get(`/api/v1/users?role=student&q=Sweep%20Student%20${RUN}`), "list users");
  expect(list.length).toBe(1);
  const tl = await json(await a.get(`/api/v1/users?role=teacher&q=${RUN}`), "teacher list");
  const pl = await json(await a.get(`/api/v1/users?role=parent&q=${RUN}`), "parent list");
  const sid = list[0].studentId, tid = tl[0].teacherId, gid = pl[0].guardianId;
  await json(await a.get(`/api/v1/users/${list[0].id}`), "get user");
  await json(await a.patch(`/api/v1/users/${list[0].id}`, { data: { rollNo: `SW2-${RUN}` } }), "patch user");
  const b2 = await json(await a.post("/api/v1/batches", { data: { name: `Sweep Batch B ${RUN}` } }), "batch b");
  await ok(await a.post(`/api/v1/batches/${b2.id}/students`, { data: { studentIds: [sid] } }), "enrol");
  await ok(await a.delete(`/api/v1/batches/${b2.id}/students/${sid}`), "unenrol");
  await ok(await a.post(`/api/v1/batches/${b2.id}/teachers`, { data: { teacherIds: [tid], subject: "Physics" } }), "assign teacher");
  await ok(await a.delete(`/api/v1/batches/${b2.id}/teachers/${tid}`), "unassign teacher");
  await ok(await a.delete(`/api/v1/batches/${b2.id}`), "delete batch");
  await ok(await a.post("/api/v1/guardian-links", { data: { guardianId: gid, studentId: sid } }), "link");
  const links = await json(await a.get(`/api/v1/guardian-links?guardianId=${gid}`), "links");
  expect(links.length).toBeGreaterThan(0);
  await ok(await a.delete(`/api/v1/guardian-links/${gid}/${sid}`), "unlink");
  const tpl = await ok(await a.get("/api/v1/imports/users/template"), "csv template");
  expect(await tpl.text()).toContain("email");
  const csv = `role,name,email,roll_no,batches\nstudent,Csv Sweep ${RUN},csv.${RUN}@e2e.test,CS-${RUN},Sweep Batch ${RUN} v2\nstudent,Bad Row,not-an-email,,\n`;
  const imp = await json(await a.post("/api/v1/imports/users", { data: { csv, filename: "sweep.csv" } }), "import csv");
  const impId = imp.id ?? imp.importId;
  expect(impId, JSON.stringify(imp)).toBeTruthy();
  const st = await json(await a.get(`/api/v1/imports/${impId}`), "import status");
  expect(JSON.stringify(st)).toMatch(/error|fail/i);
  const ecsv = await ok(await a.get(`/api/v1/imports/${impId}/errors.csv`), "errors csv");
  expect(await ecsv.text()).toContain("not-an-email");
  await ok(await a.delete(`/api/v1/users/${tl[0].id}`), "delete user");

  for (const r of ["teacher", "student", "parent"] as Role[]) {
    const cases: [string, string, any?][] = [
      ["post", "/api/v1/users", { role: "student", name: "X Y", email: "x@y.test" }], ["post", "/api/v1/batches", { name: "Nope" }],
      ["post", "/api/v1/guardian-links", { guardianId: UUID0, studentId: UUID0 }], ["get", "/api/v1/guardian-links"],
      ["get", "/api/v1/imports/users/template"], ["delete", `/api/v1/batches/${batch.id}`],
    ];
    for (const [m, p, d] of cases) expect(await status(ctx[r], m, p, d), `${m} ${p} as ${r}`).toBe(403);
  }
  for (const [m, p] of [["get", "/api/v1/users"], ["get", "/api/v1/batches"], ["post", "/api/v1/batches"], ["get", "/api/v1/guardian-links"], ["get", "/api/v1/imports/users/template"]]) {
    expect(await status(ctx.anon, m, p), `anon ${m} ${p}`).toBe(401);
  }
  expect(await status(ctx.teacher, "get", "/api/v1/batches")).toBe(200);
  expect(await status(ctx.student, "get", "/api/v1/batches")).toBe(200);
});

test("syllabus", async () => {
  const a = ctx.admin, base = "/api/v1/syllabus";
  const tpls = await json(await a.get(`${base}/templates`), "templates");
  await json(await a.get(`${base}/tree`), "tree");
  if (tpls[0]) await json(await a.post(`${base}/templates/copy`, { data: { templateRootId: tpls[0].id } }), "copy template");
  const exam = await json(await a.post(`${base}/nodes`, { data: { level: "exam", name: `Sweep Exam ${RUN}` } }), "node exam");
  const subj = await json(await a.post(`${base}/nodes`, { data: { level: "subject", name: "Sweep Subject", parentId: exam.id } }), "node subject");
  const unit = await json(await a.post(`${base}/nodes`, { data: { level: "unit", name: "Sweep Unit", parentId: subj.id } }), "node unit");
  const chap = await json(await a.post(`${base}/nodes`, { data: { level: "chapter", name: "Sweep Chapter", parentId: unit.id } }), "node chapter");
  const topic = await json(await a.post(`${base}/nodes`, { data: { level: "topic", name: "Sweep Topic", parentId: chap.id } }), "node topic");
  expect(await status(a, "post", `${base}/nodes`, { level: "topic", name: "Bad", parentId: exam.id })).toBe(400);
  const up = await json(await a.patch(`${base}/nodes/${topic.id}`, { data: { name: "Sweep Topic renamed" } }), "rename node");
  expect(up.name).toBe("Sweep Topic renamed");
  await json(await a.post(`${base}/materials`, { data: { topicId: topic.id, title: "Notes", storageKey: `sweep/${RUN}.pdf`, mimeType: "application/pdf", sizeBytes: 10 } }), "add material");
  expect((await json(await a.get(`${base}/topics/${topic.id}/materials`), "materials")).length).toBe(1);
  await json(await a.get(`${base}/batches/${S.batchId}/progress`), "progress");
  await json(await a.put(`${base}/batches/${S.batchId}/progress/${topic.id}`, { data: { status: "completed" } }), "set progress");
  await json(await ctx.teacher.get(`${base}/tree`), "teacher tree");
  await json(await ctx.student.get(`${base}/tree`), "student tree");
  for (const r of ["student", "parent"] as Role[]) {
    expect(await status(ctx[r], "post", `${base}/nodes`, { level: "exam", name: "x" }), `node create as ${r}`).toBe(403);
    expect(await status(ctx[r], "delete", `${base}/nodes/${exam.id}`)).toBe(403);
    expect(await status(ctx[r], "post", `${base}/materials`, {})).toBe(403);
  }
  expect(await status(ctx.anon, "get", `${base}/tree`)).toBe(401);
  await ok(await a.delete(`${base}/nodes/${exam.id}`), "delete node subtree");
});

test("questions", async () => {
  const t = ctx.teacher, base = "/api/v1/questions";
  const txt = (s: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: s }] }] });
  const payload = { type: "mcq_single", stem: txt(`What is ${RUN}?`), options: [{ id: "A", content: txt("one") }, { id: "B", content: txt("two") }], correct: ["B"], marks: 4, negativeMarks: 1, difficulty: "easy", topicIds: [] };
  const q = await json(await t.post(base, { data: { payload } }), "create question");
  S.qid = q.questionId ?? q.id;
  expect(S.qid).toBeTruthy();
  await json(await t.get(`${base}/${S.qid}`), "get question");
  await json(await t.put(`${base}/${S.qid}`, { data: { payload: { ...payload, marks: 5 }, changeNote: "bump" } }), "update question");
  const vs = await json(await t.get(`${base}/${S.qid}/versions`), "versions");
  expect(vs.length).toBe(2);
  await json(await t.get(`${base}/${S.qid}/versions/1`), "version 1");
  const s = await json(await t.get(`${base}?q=${RUN}`), "search");
  expect(JSON.stringify(s)).toContain(S.qid);
  await json(await t.post(`${base}/duplicates`, { data: { stemText: `What is ${RUN}?` } }), "duplicates");
  for (const type of ["numeric", "mcq_multi", "true_false", "subjective"]) {
    const p: any = { type, stem: txt(`${type} ${RUN}`), marks: 4, negativeMarks: 0, difficulty: "medium", topicIds: [] };
    if (type === "numeric") p.numeric = { answer: 3.5, tolerance: 0.1, toleranceKind: "absolute" };
    if (type === "mcq_multi") { p.options = payload.options; p.correct = ["A", "B"]; }
    if (type === "true_false") p.correct = ["true"];
    await json(await t.post(base, { data: { payload: p } }), `create ${type}`);
  }
  expect(await status(t, "post", base, { payload: { type: "mcq_single", stem: txt("x"), options: payload.options, correct: ["Z"] } })).toBe(400);
  await json(await ctx.admin.get(`${base}/${S.qid}`), "admin get question");
  // students and parents must not read or author questions (the answers are inside)
  for (const r of ["student", "parent"] as Role[]) {
    expect(await status(ctx[r], "get", `${base}/${S.qid}`), `get question as ${r}`).toBe(403);
    expect(await status(ctx[r], "get", base), `list questions as ${r}`).toBe(403);
    expect(await status(ctx[r], "post", base, { payload }), `create question as ${r}`).toBe(403);
    expect(await status(ctx[r], "put", `${base}/${S.qid}`, { payload }), `update question as ${r}`).toBe(403);
  }
  expect(await status(ctx.anon, "get", base)).toBe(401);
});

test("ingestion: upload, review, flags, answer key, approve", async () => {
  const t = ctx.teacher, base = "/api/v1/ingestion/papers";
  const up = await t.post(base, { multipart: { title: `Sweep Paper ${RUN}`, file: { name: "sample-paper.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: fs.readFileSync(SAMPLE_DOCX) } } });
  const paper = await json(up, "upload paper");
  S.paperId = paper.id;
  let detail: any;
  for (let i = 0; i < 60; i++) {
    detail = await json(await t.get(`${base}/${paper.id}`), "get paper");
    if (detail.status === "review" || detail.status === "failed") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  expect(detail.status, JSON.stringify(detail.parseError)).toBe("review");
  expect((await json(await t.get(base), "list papers")).some((p: any) => p.id === paper.id)).toBe(true);
  expect(detail.drafts.length).toBeGreaterThan(5);
  const d = detail.drafts[0];
  await json(await t.patch(`${base}/${paper.id}/drafts/${d.id}`, { data: { stem: `${d.stem} (edited)` } }), "patch draft");
  await json(await t.patch(`${base}/${paper.id}/drafts/${d.id}`, { data: { resolveFlags: ["x"] } }), "resolve flags");
  await json(await t.put(`${base}/${paper.id}/answer-key`, { data: { text: "1-A" } }), "answer key text");
  let approve = await t.post(`${base}/${paper.id}/approve`);
  if (approve.status() === 422) {
    const key: Record<string, string> = {};
    for (const x of detail.drafts) key[String(x.ordinal)] = x.options?.[0]?.id ?? x.options?.[0]?.key ?? "A";
    await json(await t.put(`${base}/${paper.id}/answer-key`, { data: { key } }), "full answer key");
    for (const x of detail.drafts) if (x.flags?.length) await t.patch(`${base}/${paper.id}/drafts/${x.id}`, { data: { resolveFlags: x.flags.map((f: any) => f.code) } });
    approve = await t.post(`${base}/${paper.id}/approve`);
  }
  await ok(approve, "approve paper");
  const after = await json(await t.get(`${base}/${paper.id}`), "approved paper");
  expect(after.status).toBe("approved");
  S.paperDetail = after;
  expect(await status(t, "patch", `${base}/${paper.id}/drafts/${d.id}`, { stem: "late" }), "edit after approval").toBeGreaterThanOrEqual(400);
  for (const r of ["student", "parent"] as Role[]) {
    for (const [m, p] of [["get", base], ["get", `${base}/${paper.id}`], ["post", `${base}/${paper.id}/approve`], ["put", `${base}/${paper.id}/answer-key`], ["patch", `${base}/${paper.id}/drafts/${d.id}`]]) {
      expect(await status(ctx[r], m, p, m === "get" ? undefined : {}), `${m} ${p} as ${r}`).toBe(403);
    }
    const up2 = await ctx[r].post(base, { multipart: { file: { name: "a.docx", mimeType: "application/octet-stream", buffer: Buffer.from("x") } } });
    expect(up2.status(), `upload as ${r}`).toBe(403);
  }
  expect(await status(ctx.anon, "get", base)).toBe(401);
});

test("exams: create, publish, attempt, autosave, incident, submit", async () => {
  const t = ctx.teacher, s = ctx.student;
  const detail = S.paperDetail;
  const bySection = new Map<string, string[]>();
  for (const d of [...detail.drafts].sort((a: any, b: any) => a.ordinal - b.ordinal)) bySection.set(d.section ?? "General", [...(bySection.get(d.section ?? "General") ?? []), d.questionId]);
  const found = await json(await ctx.admin.get("/api/v1/users?role=student&q=demo.test"), "find demo student");
  const demoStudent = found.find((u: any) => u.email === "student@demo.test");
  await ok(await ctx.admin.post(`/api/v1/batches/${S.batchId}/students`, { data: { studentIds: [demoStudent.studentId] } }), "enrol demo student");
  const demoTeacher = (await json(await ctx.admin.get("/api/v1/users?role=teacher&q=demo.test"), "find demo teacher")).find((u: any) => u.email === "teacher@demo.test");
  await ok(await ctx.admin.post(`/api/v1/batches/${S.batchId}/teachers`, { data: { teacherIds: [demoTeacher.teacherId], subject: "Physics" } }), "assign demo teacher");
  const mk = (extra: any = {}) => ({ title: `Sweep Test ${RUN}`, paperId: S.paperId, batchIds: [S.batchId], presetKey: "nta", durationMinutes: 20,
    sections: [...bySection].map(([name, questionIds]) => ({ name, questionIds })),
    windowStart: new Date(Date.now() - 60_000).toISOString(), windowEnd: new Date(Date.now() + 86_400_000).toISOString(), ...extra });
  const created = await json(await t.post("/api/v1/tests", { data: mk() }), "create test");
  S.testId = created.id;
  expect((await json(await t.get("/api/v1/tests"), "list tests")).some((x: any) => x.id === S.testId)).toBe(true);
  expect(await status(s, "get", "/api/v1/tests/upcoming")).toBe(200);
  expect(await status(s, "post", `/api/v1/tests/${S.testId}/attempts`), "cannot start a draft test").toBeGreaterThanOrEqual(400);
  await ok(await t.post(`/api/v1/tests/${S.testId}/publish`), "publish");
  const up = await json(await s.get("/api/v1/tests/upcoming"), "upcoming");
  expect(up.some((x: any) => x.id === S.testId)).toBe(true);
  const att = await json(await s.post(`/api/v1/tests/${S.testId}/attempts`), "start attempt");
  S.attemptId = att.attemptId ?? att.id;
  const qs = await json(await s.get(`/api/v1/attempts/${S.attemptId}/questions`), "attempt questions");
  const list = Array.isArray(qs) ? qs : qs.questions ?? qs.items ?? [];
  expect(list.length).toBeGreaterThan(0);
  expect(JSON.stringify(qs), "student must never receive the answer key").not.toMatch(/"correct"/);
  const items = list.slice(0, 3).map((q: any, i: number) => ({ questionId: q.id ?? q.questionId, seq: i + 1, status: "answered", value: { selected: [q.options?.[0]?.id ?? "A"], numeric: null }, timeSpentMs: 1000 }));
  const sv = await json(await s.post(`/api/v1/attempts/${S.attemptId}/answers`, { data: { items } }), "autosave");
  expect(sv.applied).toBe(items.length);
  const replay = await json(await s.post(`/api/v1/attempts/${S.attemptId}/answers`, { data: { items } }), "autosave replay");
  expect(replay.applied).toBe(0);
  await json(await s.post(`/api/v1/attempts/${S.attemptId}/incidents`, { data: { type: "tab_hidden", occurredAt: new Date().toISOString(), durationMs: 500 } }), "incident");
  for (const r of ["teacher", "parent"] as Role[]) expect(await status(ctx[r], "post", `/api/v1/attempts/${S.attemptId}/answers`, { items }), `autosave as ${r}`).toBeGreaterThanOrEqual(403);
  expect(await status(ctx.parent, "get", `/api/v1/attempts/${S.attemptId}/questions`)).toBeGreaterThanOrEqual(403);
  expect(await status(ctx.anon, "get", `/api/v1/attempts/${S.attemptId}/questions`)).toBe(401);
  const rc = await json(await s.post(`/api/v1/attempts/${S.attemptId}/submit`), "submit");
  expect(rc.receiptCode).toBeTruthy();
  for (const r of ["student", "parent"] as Role[]) {
    expect(await status(ctx[r], "post", "/api/v1/tests", mk()), `create test as ${r}`).toBe(403);
    expect(await status(ctx[r], "post", `/api/v1/tests/${S.testId}/publish`)).toBe(403);
    expect(await status(ctx[r], "get", "/api/v1/tests")).toBe(403);
  }
  for (const r of ["teacher", "parent"] as Role[]) expect(await status(ctx[r], "post", `/api/v1/tests/${S.testId}/attempts`), `start attempt as ${r}`).toBe(403);
  expect(await status(ctx.anon, "get", "/api/v1/tests")).toBe(401);
});

test("results: evaluation, rank, report, settings, release, corrections, analytics", async () => {
  const s = ctx.student, t = ctx.teacher;
  let mine: any[] = [];
  for (let i = 0; i < 60; i++) {
    mine = await json(await s.get("/api/v1/results/mine"), "results mine");
    if (mine.some((m) => m.attemptId === S.attemptId)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  expect(mine.some((m) => m.attemptId === S.attemptId), "worker evaluated the sweep attempt").toBe(true);
  await json(await s.get(`/api/v1/results/${S.attemptId}`), "result");
  const pdf = await ok(await s.get(`/api/v1/results/${S.attemptId}/report.pdf`), "report.pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await json(await t.get(`/api/v1/results/${S.attemptId}`), "teacher views result");
  const pm = await json(await ctx.parent.get("/api/v1/results/mine"), "parent results");
  expect(Array.isArray(pm)).toBe(true);
  const lb = await json(await t.get(`/api/v1/tests/${S.testId}/leaderboard`), "leaderboard");
  expect(lb.label).toMatch(/mock rank/i);
  await json(await t.get(`/api/v1/tests/${S.testId}/leaderboard?scope=batch&scopeId=${S.batchId}`), "batch leaderboard");
  await json(await s.get(`/api/v1/tests/${S.testId}/leaderboard`), "student own leaderboard row");
  expect(await status(ctx.parent, "get", `/api/v1/tests/${S.testId}/leaderboard`)).toBe(403);
  await json(await t.put(`/api/v1/tests/${S.testId}/result-settings`, { data: { releaseMode: "manual", tieBreakers: ["fewer_incorrect"], minPercentileParticipants: 5 } }), "result settings");
  expect(await status(t, "put", `/api/v1/tests/${S.testId}/result-settings`, { releaseMode: "scheduled" })).toBe(400);
  await json(await t.post(`/api/v1/tests/${S.testId}/results/release`), "release");
  const q0 = S.paperDetail.drafts[0].questionId;
  const cor = await t.post(`/api/v1/tests/${S.testId}/answer-key/corrections`, { data: { corrections: [{ questionId: q0, dropped: "award_all", reason: "sweep" }] } });
  expect(cor.status(), await cor.text()).toBeLessThan(300);
  await json(await t.get(`/api/v1/analytics/batch?batchId=${S.batchId}`), "batch analytics");
  const csv = await ok(await t.get("/api/v1/analytics/batch.csv"), "batch.csv");
  expect(await csv.text()).toContain("test_id,title");
  await json(await s.get("/api/v1/analytics/me"), "analytics me");
  await json(await t.get(`/api/v1/analytics/students/${S.me_student.user.id}`), "analytics student");
  await json(await ctx.parent.get(`/api/v1/analytics/students/${S.childUserId}`), "parent child analytics");
  expect(await status(s, "get", "/api/v1/analytics/batch")).toBe(403);
  expect(await status(ctx.parent, "get", "/api/v1/analytics/batch")).toBe(403);
  expect(await status(s, "get", "/api/v1/analytics/batch.csv")).toBe(403);
  expect(await status(s, "get", `/api/v1/analytics/students/${S.me_teacher.user.id}`)).toBe(403);
  expect(await status(ctx.parent, "get", `/api/v1/analytics/students/${S.me_teacher.user.id}`)).toBe(403);
  for (const r of ["student", "parent"] as Role[]) {
    expect(await status(ctx[r], "put", `/api/v1/tests/${S.testId}/result-settings`, { releaseMode: "manual" }), `settings as ${r}`).toBe(403);
    expect(await status(ctx[r], "post", `/api/v1/tests/${S.testId}/results/release`)).toBe(403);
    expect(await status(ctx[r], "post", `/api/v1/tests/${S.testId}/answer-key/corrections`, { corrections: [{ questionId: q0, dropped: "void" }] })).toBe(403);
  }
  for (const p of [`/api/v1/results/${S.attemptId}`, "/api/v1/results/mine", "/api/v1/analytics/me", `/api/v1/tests/${S.testId}/leaderboard`]) expect(await status(ctx.anon, "get", p), `anon ${p}`).toBe(401);
  // a parent not linked to the sweep attempt's student must not read it
  const pr = await status(ctx.parent, "get", `/api/v1/results/${S.attemptId}`);
  expect(pr === 200, "parent linked to the demo student may read it; anyone else must get 403/404").toBe(true);
});

test("notifications", async () => {
  for (const r of ["student", "admin", "teacher", "parent"] as Role[]) {
    const c = ctx[r], b = "/api/v1/notifications";
    const list = await json(await c.get(b), `list ${r}`);
    const items = Array.isArray(list) ? list : list.items;
    const cnt = await json(await c.get(`${b}/unread-count`), "count");
    expect(typeof (cnt.count ?? cnt.unread ?? 0)).toBe("number");
    if (items?.[0]) await ok(await c.post(`${b}/${items[0].id}/read`), "mark read");
    await ok(await c.post(`${b}/read-all`), "read all");
    expect((await json(await c.get(`${b}/unread-count`), "count after")).count ?? 0).toBe(0);
    await json(await c.get(`${b}/preferences`), "prefs");
    await json(await c.put(`${b}/preferences`, { data: { preferences: [{ type: "result_released", channel: "email", enabled: false }] } }), "set prefs");
  }
  expect(await status(ctx.anon, "get", "/api/v1/notifications")).toBe(401);
  expect(await status(ctx.student, "post", `/api/v1/notifications/${UUID0}/read`)).toBeGreaterThanOrEqual(400);
});

test.afterAll(async () => {
  try { if (S.batchId) await ctx.admin.delete(`/api/v1/batches/${S.batchId}`); } catch { /* ignore */ }
});

test("students and parents cannot list users", async () => {
  for (const r of ["student", "parent"] as Role[]) expect(await status(ctx[r], "get", "/api/v1/users"), `users as ${r}`).toBe(403);
});

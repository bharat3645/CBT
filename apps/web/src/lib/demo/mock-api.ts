/**
 * Demo mode (NEXT_PUBLIC_DEMO=1): serves the whole /api/v1 surface from a snapshot of the real seeded API
 * (apps/web/public/demo/snapshot.json, produced by e2e/tests/70-capture-demo-snapshot.spec.ts), entirely in the browser.
 * No backend is needed, so the app can be hosted on a static/serverless host such as Vercel.
 *
 * What is real: every list, dashboard, result, rank and analytic is a recorded response from the real API.
 * What is simulated: sign-in (the four demo accounts), and writes. Writes are acknowledged and the interactive flows
 * (attendance, feedback, practice answers, exam answers) keep their state in this browser tab so the demo feels live.
 */
import { DEMO_PASSWORD, DEMO_USERS, type DemoRole } from "./accounts";

type Entry = { status: number; body: any };
type Snapshot = {
  capturedAt: string;
  roles: Record<string, Record<string, Entry>>;
  practiceKey: Record<string, { correctAnswer: unknown; explanation: unknown }>;
  practicePool: any[];
};

const ROLE_KEY = "demo.role";
const STATE_KEY = "demo.state.v1";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

let snapshotPromise: Promise<Snapshot> | null = null;
const loadSnapshot = (realFetch: typeof fetch) => (snapshotPromise ??= realFetch("/demo/snapshot.json").then((r) => r.json()));

/* ---------- tiny persisted state (per tab) ---------- */
type State = {
  attendance: Record<string, Record<string, string>>; // `${batchId}|${date}` -> studentUserId -> status
  feedback: { id: string; studentUserId: string; authorName: string; body: string; createdAt: string }[];
  practice: { attempted: number; correct: number };
  attempts: Record<string, { startedAt: number; answers: Record<string, any> }>;
};
const blank = (): State => ({ attendance: {}, feedback: [], practice: { attempted: 0, correct: 0 }, attempts: {} });
function state(): State {
  try {
    return { ...blank(), ...JSON.parse(sessionStorage.getItem(STATE_KEY) ?? "{}") };
  } catch {
    return blank();
  }
}
function save(s: State) {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {
    /* private mode: state just lasts until the next reload */
  }
}

/* ---------- role / session ---------- */
const getRole = (): DemoRole | null => {
  try {
    return (localStorage.getItem(ROLE_KEY) as DemoRole | null) ?? null;
  } catch {
    return null;
  }
};
function setRole(role: DemoRole | null) {
  try {
    if (role) localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
  } catch {
    /* ignore */
  }
  document.cookie = role ? "better-auth.session_token=demo; path=/; SameSite=Lax" : "better-auth.session_token=; path=/; Max-Age=0";
}

/* ---------- helpers ---------- */
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const norm = (k: string) => k.replace(UUID, ":id");

/** Shift every ISO timestamp by the age of the snapshot so "live now" tests are still live and "released 2 days ago" stays recent. */
function shiftDates(v: any, delta: number): any {
  if (typeof v === "string") return ISO.test(v) ? new Date(new Date(v).getTime() + delta).toISOString() : v;
  if (Array.isArray(v)) return v.map((x) => shiftDates(x, delta));
  if (v && typeof v === "object") {
    // The recorded storage links have expired: a PDF paper shows a bundled sample source page instead.
    const pdf = typeof v.filename === "string" && v.filename.toLowerCase().endsWith(".pdf");
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "originalUrl" && pdf ? "/demo/source-page.html" : shiftDates(x, delta)]));
  }
  return v;
}

function lookup(snap: Snapshot, role: string | null, method: string, path: string, search: string): Entry | undefined {
  const buckets = [role ? snap.roles[role] : undefined, snap.roles.anon].filter(Boolean) as Record<string, Entry>[];
  const full = `${method} /api/v1${path}`;
  for (const b of buckets) {
    if (b[full + search]) return b[full + search];
    if (b[full]) return b[full];
  }
  // same route with different ids (e.g. a freshly created record): fall back to the first recorded response of that shape
  const shape = norm(full);
  for (const b of buckets) {
    const hit = Object.keys(b).find((k) => norm(k.split("?")[0]!) === shape);
    if (hit) return b[hit];
  }
  return undefined;
}

const ok = (b: unknown = { ok: true }, status = 200): Entry => ({ status, body: b });

/* ---------- the handler ---------- */
export async function handle(realFetch: typeof fetch, method: string, url: URL, rawBody: string | undefined): Promise<Response> {
  const snap = await loadSnapshot(realFetch);
  const delta = Date.now() - new Date(snap.capturedAt).getTime();
  const path = url.pathname.replace(/^\/api\/v1/, "");
  const role = getRole();
  const body = rawBody ? safeParse(rawBody) : undefined;
  const reply = (e: Entry) => json(shiftDates(e.body, delta), e.status);

  /* --- auth --- */
  if (path === "/auth/sign-in/email" && method === "POST") {
    const user = DEMO_USERS.find((u) => u.email === String(body?.email ?? "").trim().toLowerCase());
    if (!user || body?.password !== (user?.role === "super_admin" ? "ChangeMe!12345" : DEMO_PASSWORD)) return json({ message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" }, 401);
    setRole(user.role);
    const session = snap.roles[user.role]?.["GET /api/v1/auth/get-session"]?.body;
    return json({ redirect: false, token: "demo", user: session?.user ?? { id: user.email, email: user.email, name: user.name } });
  }
  if (path === "/auth/sign-out") {
    setRole(null);
    return json({ success: true });
  }
  if (path === "/auth/get-session") {
    if (!role) return json(null);
    return reply(snap.roles[role]?.["GET /api/v1/auth/get-session"] ?? ok(null));
  }
  if (path.startsWith("/auth/")) return json({ ok: true });
  if (path === "/me") {
    if (!role) return json({ message: "Unauthorized" }, 401);
    const u = snap.roles[role]?.["GET /api/v1/auth/get-session"]?.body?.user;
    return json({ userId: u?.id, name: u?.name, email: u?.email, role: role === "admin" ? "institute_admin" : role });
  }
  if (!role && path !== "/health" && !(path === "/institutes" && method === "POST")) return json({ message: "Unauthorized" }, 401);
  if (path === "/health") return json({ ok: true });
  if (path === "/institutes" && method === "POST") return json({ id: "demo", status: "pending" }, 201);

  const st = state();
  const stu: Record<string, Entry> = snap.roles.student ?? {};

  /* --- attendance: marks persist for the session and flow into the roster --- */
  if (path === "/attendance/roster") {
    const e = lookup(snap, role, "GET", path, url.search) ?? ok([]);
    const key = `${url.searchParams.get("batchId")}|${url.searchParams.get("date")}`;
    const marks = st.attendance[key] ?? {};
    return json((e.body as any[]).map((r) => ({ ...r, status: marks[r.studentUserId] ?? r.status })));
  }
  if (path === "/attendance" && method === "PUT") {
    const key = `${body.batchId}|${body.date}`;
    st.attendance[key] = { ...(st.attendance[key] ?? {}), ...Object.fromEntries((body.records ?? []).map((r: any) => [r.studentUserId, r.status])) };
    save(st);
    return json({ saved: (body.records ?? []).length });
  }

  /* --- feedback --- */
  if (path === "/feedback" && method === "POST") {
    const author = snap.roles[role!]?.["GET /api/v1/auth/get-session"]?.body?.user?.name ?? "Teacher";
    st.feedback.unshift({ id: `fb-${Date.now()}`, studentUserId: body.studentUserId, authorName: author, body: body.body, createdAt: new Date().toISOString() });
    save(st);
    return json({ id: st.feedback[0]!.id }, 201);
  }
  if (path === "/feedback") {
    const base = (lookup(snap, role, "GET", path, url.search)?.body as any[]) ?? [];
    const sid = url.searchParams.get("studentUserId");
    const mine = st.feedback.filter((f) => !sid || f.studentUserId === sid);
    return json(shiftDates([...mine, ...base], delta));
  }

  /* --- practice: answer keys come from the snapshot, correctness is computed here --- */
  if (path === "/practice/set") {
    const n = Math.min(Math.max(Number(url.searchParams.get("count")) || 5, 1), 15);
    const pool = [...snap.practicePool].sort(() => Math.random() - 0.5).slice(0, n);
    return json(pool);
  }
  if (path === "/practice/check" && method === "POST") {
    const key = snap.practiceKey[body.questionId];
    if (!key) return json({ message: "Question not found" }, 404);
    const want = key.correctAnswer;
    const given = Array.isArray(body.answer) ? body.answer : [body.answer];
    const correct = Array.isArray(want)
      ? [...given].sort().join(",") === [...(want as string[])].sort().join(",")
      : Math.abs(Number(given[0]) - Number(want)) < 1e-6;
    st.practice = { attempted: st.practice.attempted + 1, correct: st.practice.correct + (correct ? 1 : 0) };
    save(st);
    return json({ correct, correctAnswer: want, explanation: key.explanation });
  }
  if (path === "/practice/stats") return json(st.practice);

  /* --- live exam: start/resume, autosave, submit --- */
  let m = path.match(/^\/tests\/([^/]+)\/attempts$/);
  if (m && method === "POST") {
    const rec = lookup(snap, role, "POST", `/tests/${m[1]}/attempts`, "")?.body;
    if (!rec) return json({ message: "Test not available in the demo" }, 404);
    const a = (st.attempts[rec.attemptId] ??= { startedAt: Date.now(), answers: {} });
    save(st);
    const total = rec.remainingMs as number;
    return json({ ...rec, remainingMs: Math.max(total - (Date.now() - a.startedAt), 20_000), resumedAnswers: Object.values(a.answers) });
  }
  m = path.match(/^\/attempts\/([^/]+)\/answers$/);
  if (m && method === "POST") {
    const a = (st.attempts[m[1]!] ??= { startedAt: Date.now(), answers: {} });
    let highest = 0;
    for (const it of body.items ?? []) {
      a.answers[it.questionId] = it;
      highest = Math.max(highest, it.seq);
    }
    save(st);
    const rec = Object.values(stu).find((e) => e.body?.remainingMs)?.body?.remainingMs ?? 1_800_000;
    return json({ applied: (body.items ?? []).length, ignored: 0, highestSeq: highest, serverRemainingMs: Math.max(rec - (Date.now() - a.startedAt), 0), status: "in_progress" });
  }
  m = path.match(/^\/attempts\/([^/]+)\/(incidents|submit)$/);
  if (m && method === "POST") {
    const rec = Object.entries(stu).find(([k]) => k.startsWith("POST") && k.endsWith(`/${m![2]}`))?.[1];
    if (m[2] === "submit") return json(rec ? { ...rec.body, submittedAt: new Date().toISOString() } : { receiptCode: "DEMO-RECEIPT", submittedAt: new Date().toISOString() }, 201);
    return json(rec?.body ?? { ok: true }, 201);
  }
  m = path.match(/^\/attempts\/([^/]+)\/questions$/);
  if (m) {
    const rec = Object.entries(stu).find(([k]) => /^GET \/api\/v1\/attempts\/[^/]+\/questions$/.test(k))?.[1];
    return rec ? json(rec.body) : json({ message: "Not found" }, 404);
  }

  /* --- downloads --- */
  if (/\/export|\.csv$/.test(path)) return new Response("Name,Score\nDemo Student,92\n", { status: 200, headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="demo-export.csv"' } });
  if (/\/report/.test(path) && method === "GET") return new Response("%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF", { status: 200, headers: { "content-type": "application/pdf" } });

  /* --- everything else: replay the recorded response, or acknowledge a write --- */
  if (method === "GET") {
    const e = lookup(snap, role, method, path, url.search);
    return e ? reply(e) : json({ message: "This view is not part of the demo snapshot" }, 404);
  }
  const e = lookup(snap, role, method, path, "");
  return e && e.status < 400 ? reply({ status: e.status, body: e.body }) : json({ ok: true, demo: true }, method === "POST" ? 201 : 200);
}

function safeParse(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

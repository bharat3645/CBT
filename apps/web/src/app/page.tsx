import Link from "next/link";
import { ArrowRight, BarChart3, CalendarCheck, FileUp, GraduationCap, MessageSquare, MonitorCheck, ShieldCheck, Timer, Trophy, Users } from "lucide-react";
import { Button } from "@cbt/ui";
import { IS_DEMO } from "@/lib/demo/flag";

const features = [
  { icon: FileUp, title: "Paper to CBT in minutes", body: "Upload a Word or PDF paper. Questions, options, maths and the answer key are extracted, doubtful ones are flagged, and you approve a clean paper." },
  { icon: MonitorCheck, title: "Exam-grade test screen", body: "Server-driven timer, five-state question palette, autosave with offline tolerance and strict-mode incident logging." },
  { icon: Trophy, title: "Marks, ranks, percentiles", body: "NTA-style +4/-1 marking, section scores and topic analysis. Batch and test ranks appear the moment a test closes." },
  { icon: BarChart3, title: "Analytics that teach", body: "Weak-topic detection per student, batch comparison, question-level accuracy and exportable reports." },
  { icon: CalendarCheck, title: "Attendance and feedback", body: "Teachers mark attendance in a tap; parents are alerted to absences and read written feedback on their child." },
  { icon: ShieldCheck, title: "Isolated per institute", body: "Postgres row-level security on every table, an insert-only audit trail and a test suite that attacks every endpoint cross-tenant." },
];

const roles = [
  { icon: Users, name: "Institute admin", body: "Batches, people, papers, flags, reports and branding in one workspace." },
  { icon: GraduationCap, name: "Teacher", body: "Upload papers, build tests, mark attendance, write feedback, watch insights." },
  { icon: Timer, name: "Student", body: "Sit live exams, see rank and weak topics, practise by topic with instant explanations." },
  { icon: MessageSquare, name: "Parent", body: "Follow results, attendance and teacher feedback for each linked child." },
];

const steps = [
  ["Upload", "Drop in a DOCX or PDF paper. It is virus-scanned and stored untouched."],
  ["Review", "Side-by-side editor shows every extracted question next to the source page, with confidence and flags."],
  ["Publish", "Pick a preset (NTA, private-university MCQ, practice), assign batches and a window."],
  ["Learn", "Results, ranks and weak topics reach students and parents automatically."],
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">P</span>
            PrepDesk
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link href={IS_DEMO ? "/login" : "/signup"}>{IS_DEMO ? "Try the demo" : "Get started"}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_80%_0%,rgba(59,91,253,0.35),transparent),radial-gradient(40%_50%_at_0%_100%,rgba(124,58,237,0.25),transparent)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:py-24 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent/50 px-3 py-1 text-xs text-sidebar-muted">
              <span className="size-1.5 rounded-full bg-exam-answered" /> Built for entrance-exam coaching institutes
            </p>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Run exam prep like the real exam.</h1>
            <p className="mt-4 max-w-xl text-base text-sidebar-muted">
              Turn question papers into computer-based tests, run them at scale, and give every student, teacher and parent a clear view of progress.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href={IS_DEMO ? "/login" : "/signup"}>
                  {IS_DEMO ? "Explore the live demo" : "Start your institute"} <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent" asChild>
                <Link href="/login">Log in</Link>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 text-sm">
              {[["60", "question bank"], ["47", "graded attempts"], ["4", "role workspaces"]].map(([n, l]) => (
                <div key={l}>
                  <dt className="text-2xl font-semibold text-white">{n}</dt>
                  <dd className="text-sidebar-muted">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/admin.png" alt="PrepDesk admin dashboard" className="w-full rounded-xl border border-sidebar-border shadow-2xl shadow-black/40" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/exam.png" alt="Live exam screen with question palette" className="absolute -bottom-6 -left-4 hidden w-2/5 rounded-lg border border-sidebar-border shadow-xl shadow-black/50 md:block" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">Everything an institute needs, nothing it doesn&apos;t</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Four differentiators are built by hand: the paper segmenter, the conversion review editor, the CBT engine, and evaluation with ranking.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="group rounded-xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="mb-3 flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <f.icon className="size-5" />
              </span>
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">From paper to progress report</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {steps.map(([t, b], i) => (
              <li key={t} className="relative rounded-xl border border-border bg-background p-5">
                <span className="mb-3 flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                <h3 className="font-medium">{t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{b}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/review.png" alt="Side-by-side paper review editor" className="w-full rounded-xl border border-border shadow-sm" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/result.png" alt="Student result page with score, section breakdown and rank" className="w-full rounded-xl border border-border shadow-sm" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">One platform, four workspaces</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((r) => (
            <div key={r.name} className="rounded-xl border border-border bg-card p-5">
              <r.icon className="mb-3 size-5 text-primary" />
              <h3 className="font-medium">{r.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-2xl bg-sidebar p-8 text-sidebar-foreground md:flex-row md:items-center">
          <div>
            <h3 className="text-xl font-semibold">{IS_DEMO ? "See it with a real coaching institute's data" : "Ready to run your first mock?"}</h3>
            <p className="mt-1 text-sm text-sidebar-muted">{IS_DEMO ? "Log in as an admin, teacher, student or parent in one click." : "Register your institute. A platform admin approves it, then you are in."}</p>
          </div>
          <Button size="lg" asChild>
            <Link href={IS_DEMO ? "/login" : "/signup"}>{IS_DEMO ? "Open the demo" : "Get started"}</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">PrepDesk. Multi-tenant CBT platform.</footer>
    </div>
  );
}

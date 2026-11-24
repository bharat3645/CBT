import Link from "next/link";
import { BarChart3, FileUp, MonitorCheck, ShieldCheck, Users, Timer } from "lucide-react";
import { Button } from "@cbt/ui";

const features = [
  { icon: FileUp, title: "Paper to CBT in minutes", body: "Upload a DOCX or PDF. We extract questions, flag the doubtful ones, and you approve a clean paper." },
  { icon: MonitorCheck, title: "Exam-grade test screen", body: "Server-driven timer, 5-state question palette and autosave, built to feel like the real exam." },
  { icon: BarChart3, title: "Results and ranks", body: "Section-wise scores, topic analysis and batch ranks the moment a test closes." },
  { icon: Users, title: "Every role covered", body: "Dedicated workspaces for institute admins, teachers, students and parents." },
  { icon: ShieldCheck, title: "Isolated per institute", body: "Row-level tenant isolation and an append-only audit trail." },
  { icon: Timer, title: "Built for exam day", body: "Offline-tolerant answer saving and auto-submit when time runs out." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-card">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-sidebar text-sm font-bold text-white">P</span>
          PrepDesk
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </header>

      <section className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <p className="mb-4 inline-block rounded-full border border-sidebar-border px-3 py-1 text-xs text-sidebar-muted">For coaching institutes</p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">Run entrance-exam prep like the real thing.</h1>
          <p className="mt-4 max-w-xl text-sidebar-muted">
            Convert papers into computer-based tests, run them at scale, and give every student, teacher and parent a clear view of progress.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/signup">Start your institute</Link>
            </Button>
            <Button size="lg" variant="outline" className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent" asChild>
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-card p-5">
              <f.icon className="mb-3 size-5 text-primary" />
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">PrepDesk. All rights reserved.</footer>
    </div>
  );
}

import Link from "next/link";
import { Button } from "@cbt/ui";
import { IS_DEMO } from "@/lib/demo/flag";
import { PaperDesk, Wordmark } from "@/components/stationery";
import { RoleSwitcher } from "@/features/landing/role-switcher";

const primary = IS_DEMO ? { href: "/login", label: "Try the live demo" } : { href: "/signup", label: "Start your institute" };

const examFacts = [
  ["Server timer", "The clock lives on the server, so a refresh or a second tab cannot buy time."],
  ["Autosave offline", "Answers queue in the browser and sync the moment the connection returns."],
  ["Strict mode", "Leaving full screen is logged as an incident the teacher can review."],
];

const sealed = [
  ["Row-level security", "Every tenant table is filtered by the database itself, not by application code."],
  ["Insert-only audit log", "Changes are recorded by triggers that nobody can edit or delete."],
  ["Attacked in every build", "A test calls every endpoint as another institute and expects to be refused."],
];

/** Public landing page. Server component; only the role switcher is interactive. */
export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="wrap flex h-16 items-center justify-between">
          <Wordmark />
          <nav aria-label="Main" className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link href={primary.href}>{IS_DEMO ? "Try the demo" : "Get started"}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="wrap grid items-center gap-10 pb-16 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-8 lg:pt-16">
          <div>
            <h1 className="display max-w-[11ch]">Paper in. Ranks out.</h1>
            <p className="lead mt-6 max-w-[30ch] text-muted-foreground">Turn a question paper into a timed test and ranked results.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href={primary.href}>{primary.label}</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">Log in</Link>
              </Button>
            </div>
          </div>
          <PaperDesk className="shadow-[var(--edge-stock)]" />
        </section>

        <section className="wrap grid items-center gap-10 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:py-28">
          <div>
            <h2 className="section-title max-w-[14ch]">Check every question before it goes live.</h2>
            <p className="mt-5 max-w-[42ch] text-base text-muted-foreground">
              Each question sits beside its source page with a confidence mark. A paper with an open flag or a missing answer key cannot be approved.
            </p>
          </div>
          <figure className="stock-tex p-2 sm:p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/review.png" width={1440} height={900} alt="The paper review editor: the source page on the left, the extracted question and its flags on the right" className="w-full rounded-md" />
          </figure>
        </section>

        <section className="border-y border-border bg-muted/60">
          <div className="wrap grid items-start gap-10 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:py-28">
            <div>
              <h2 className="section-title max-w-[12ch]">One workspace for each person.</h2>
              <p className="mt-5 max-w-[38ch] text-base text-muted-foreground">Pick a role to see what it gets. Each one is a login on the live demo.</p>
            </div>
            <RoleSwitcher />
          </div>
        </section>

        <section className="wrap grid items-center gap-10 py-20 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14 lg:py-28">
          <figure className="stock-tex order-last p-2 sm:p-3 lg:order-first">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/exam.png" width={1440} height={900} alt="The live exam screen with the question, the answer options and the question palette" className="w-full rounded-md" />
          </figure>
          <div>
            <h2 className="section-title max-w-[13ch]">A test screen that behaves like the real one.</h2>
            <dl className="mt-8 divide-y divide-border border-y border-border">
              {examFacts.map(([t, b]) => (
                <div key={t} className="py-4">
                  <dt className="font-semibold">{t}</dt>
                  <dd className="mt-1 text-base text-muted-foreground">{b}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="board">
          <div className="wrap grid items-start gap-10 py-20 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-14 lg:py-28">
            <div>
              <h2 className="section-title max-w-[14ch]">Every institute is sealed off.</h2>
              <dl className="mt-8 divide-y divide-sidebar-border border-y border-sidebar-border">
                {sealed.map(([t, b]) => (
                  <div key={t} className="py-4">
                    <dt className="font-semibold">{t}</dt>
                    <dd className="mt-1 text-base text-sidebar-muted">{b}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="stock-tex rotate-[1.2deg] p-6 sm:p-8">
              <h3 className="text-2xl font-semibold tracking-tight">{IS_DEMO ? "See it with a real institute’s data." : "Run your first mock this week."}</h3>
              <p className="mt-3 text-base text-muted-foreground">
                {IS_DEMO ? "Demo Academy has 25 students, three weeks of attendance and graded results. Log in as any role in one click." : "Register your institute. The platform team approves it and you are in."}
              </p>
              <Button size="lg" className="mt-6" asChild>
                <Link href={primary.href}>{IS_DEMO ? "Open the demo" : "Get started"}</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="wrap flex flex-wrap items-center justify-between gap-4 py-8 text-sm text-muted-foreground">
        <Wordmark className="text-foreground" />
        <p>Multi-tenant CBT for coaching institutes.</p>
      </footer>
    </div>
  );
}

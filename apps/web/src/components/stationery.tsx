import * as React from "react";
import Link from "next/link";

/**
 * Stationery: the product's own documents (question paper, result sheet, teacher's note) built in CSS on cotton stock.
 * Sizes are in `em`, so each object scales as a whole with the font size of its `Desk`. The figures come from the
 * seeded Demo Academy data (the Physics sectional result and the Physics teacher's note), never from invention.
 */

/** The wordmark: an ink square with a coral tick, the settled state in the smallest possible form. */
export function Wordmark({ className = "", tone = "ink", href = "/" }: { className?: string; tone?: "ink" | "board"; href?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden>
        <rect width="28" height="28" rx="7" fill={tone === "ink" ? "var(--primary)" : "var(--card)"} />
        <path d="M8 14.5l4 4 8-9" fill="none" stroke={tone === "ink" ? "var(--sidebar-primary)" : "var(--paid)"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      PrepDesk
    </Link>
  );
}

/** A word pressed into the stock in coral, tilted a few degrees. It stamps in once on load. */
export function Stamp({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span aria-hidden className={`stamp-in pressed pointer-events-none absolute select-none rounded-[0.35em] border-[0.14em] border-current px-[0.5em] py-[0.05em] text-[1.6em] leading-none ${className}`} style={style}>
      {children}
    </span>
  );
}

/** The ground the stationery lies on, sized from one unit: 44 units wide, `em` inside. */
export function Desk({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`desk relative overflow-hidden rounded-xl ${className}`} style={{ containerType: "inline-size" }}>
      <div className="relative mx-auto aspect-[44/43] w-full" style={{ fontSize: "clamp(7.5px, 2.35cqw, 15px)" }}>
        {children}
      </div>
    </div>
  );
}

const options = [
  ["A", "2.45 m/s²"],
  ["B", "4.9 m/s²"],
  ["C", "8.49 m/s²"],
  ["D", "9.8 m/s²"],
];
const swatch = {
  answered: "bg-exam-answered",
  "not-answered": "bg-exam-not-answered",
  review: "bg-exam-review",
  flagged: "bg-exam-flagged",
  "not-visited": "bg-exam-not-visited",
} as const;
const palette = ["answered", "answered", "review", "not-answered", "answered", "flagged", "answered", "not-visited", "not-visited", "not-visited"] as const;

export function QuestionSheet({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`stock-tex absolute p-[1.6em] ${className}`} style={style}>
      <p className="text-[0.95em] font-medium text-muted-foreground">Physics Sectional, question 5 of 12</p>
      <p className="mt-[0.9em] text-[1.12em] font-medium leading-snug">A 2 kg block slides down a smooth incline of 30 degrees. What is its acceleration?</p>
      <ul className="mt-[1em] space-y-[0.55em]">
        {options.map(([k, v]) => (
          <li key={k} className={`flex items-center gap-[0.8em] rounded-[0.5em] px-[0.8em] py-[0.55em] text-[1em] ${k === "B" ? "bg-primary text-primary-foreground" : "ring-1 ring-inset ring-border"}`}>
            <span className={`flex size-[1.5em] items-center justify-center rounded-full text-[0.8em] font-semibold ${k === "B" ? "bg-primary-foreground text-primary" : "ring-1 ring-inset ring-input"}`}>{k}</span>
            <span className="fig">{v}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-[1.1em] flex gap-[0.4em]" aria-hidden>
        {palette.map((s, i) => (
          <li key={i} className={`size-[1.35em] rounded-[0.3em] ${swatch[s]}`} />
        ))}
      </ul>
    </div>
  );
}

const topics: [string, number][] = [
  ["Friction", 100],
  ["Newton's laws", 67],
  ["Capacitors", 0],
];

export function ResultSheet({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`stock-tex absolute p-[1.6em] ${className}`} style={style}>
      <p className="text-[0.95em] font-medium text-muted-foreground">Result</p>
      <p className="mt-[0.2em] text-[1.15em] font-semibold leading-tight tracking-tight">Physics Sectional: Mechanics and Electricity</p>
      <div className="mt-[1em] flex items-end gap-[1.4em] border-y border-border py-[0.8em]">
        <div>
          <p className="fig text-[3.1em] leading-none">33</p>
          <p className="fig mt-[0.2em] text-[0.95em] text-muted-foreground">of 48</p>
        </div>
        <div>
          <p className="fig text-[1.6em] leading-none">6</p>
          <p className="fig mt-[0.2em] text-[0.95em] text-muted-foreground">of 16 in test</p>
        </div>
      </div>
      <ul className="mt-[0.9em] space-y-[0.55em]">
        {topics.map(([t, v]) => (
          <li key={t} className="grid grid-cols-[6.2em_1fr_2.6em] items-center gap-[0.6em] text-[0.95em]">
            <span>{t}</span>
            <span className="h-[0.5em] overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${v}%` }} />
            </span>
            <span className="fig text-right">{v}%</span>
          </li>
        ))}
      </ul>
      <Stamp className="right-[1em] top-[5.6em]" style={{ rotate: "-9deg" }}>Graded</Stamp>
    </div>
  );
}

export function NoteCard({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`stock-tex absolute p-[1.3em] ${className}`} style={style}>
      <p className="text-[1em] leading-snug">Spend 20 minutes a day on electrostatics problems. Coulomb&rsquo;s law and capacitors are where marks are slipping.</p>
      <p className="mt-[0.8em] text-[0.9em] font-medium text-muted-foreground">Physics teacher, to Demo Student</p>
    </div>
  );
}

/** The scene used by the landing hero and the sign-in page. */
export function PaperDesk({ className = "", withNote = true }: { className?: string; withNote?: boolean }) {
  return (
    <Desk className={className}>
      <QuestionSheet className="w-[22.5em]" style={{ left: "3%", top: "5%", rotate: "-2.5deg" }} />
      <ResultSheet className="w-[20em]" style={{ right: "3%", top: "14%", rotate: "2.2deg" }} />
      {withNote && <NoteCard className="w-[18em]" style={{ left: "24%", bottom: "3%", rotate: "-1.2deg" }} />}
    </Desk>
  );
}

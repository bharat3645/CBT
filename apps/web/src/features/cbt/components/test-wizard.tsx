"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@cbt/ui";
import { Button } from "@cbt/ui";
import { errorText, inputCls } from "@/components/ui-kit";
import { DEFAULT_PRESETS, PRESET_KEYS, createTestInput, type PresetKey } from "@cbt/contracts/exams";

const STEPS = ["Paper & sections", "Preset", "Schedule", "Review"] as const;

/* Plain words for the preset settings (the codes are what the API stores). */
const NAV_LABEL: Record<string, string> = { free: "Move freely between all questions", section_free: "Move freely within a section", one_way: "One way, no going back" };
const PALETTE_LABEL: Record<string, string> = { five_state: "Five states (NTA style)", simple: "Simple (answered or not)" };
const STRICT_LABEL: Record<string, string> = { off: "Off", warn: "Warn on tab switch", strict: "Strict (full screen, switches logged)" };

export interface WizardPaper { id: string; title: string; sections: { name: string; questionIds: string[] }[] }
export interface WizardBatch { id: string; name: string; year?: number | null }

/** datetime-local value (local time, minute precision). */
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** One-click demos: the window opens a minute ago (so it is live immediately) and closes in 7 days. */
const defaultWindow = () => ({ start: toLocalInput(new Date(Date.now() - 60_000)), end: toLocalInput(new Date(Date.now() + 7 * 86_400_000)) });

/**
 * Test wizard: pick an approved paper and the batches it is for, choose a preset, schedule, review, then create + publish.
 * No batch selected means every student of the institute. Lives inside the normal sidebar shell.
 */
export function TestWizard({ papers, batches = [], onDone }: { papers: WizardPaper[]; batches?: WizardBatch[]; onDone?: (testId: string, title: string) => void }) {
  const [step, setStep] = useState(0);
  const [paperId, setPaperId] = useState(papers[0]?.id ?? "");
  const [title, setTitle] = useState(papers[0]?.title ?? "");
  const [titleTouched, setTitleTouched] = useState(false);
  const [batchIds, setBatchIds] = useState<string[]>(batches.length === 1 ? [batches[0]!.id] : []);
  const [presetKey, setPresetKey] = useState<PresetKey>("nta");
  const [duration, setDuration] = useState(180);
  const [{ start, end }, setWindow] = useState(defaultWindow);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const paper = papers.find((p) => p.id === paperId);
  const cfg = DEFAULT_PRESETS[presetKey].config;

  // The batch list loads asynchronously: with exactly one batch, assign it by default.
  useEffect(() => {
    if (batches.length === 1) setBatchIds((cur) => (cur.length ? cur : [batches[0]!.id]));
  }, [batches]);

  const pickPaper = (id: string) => {
    setPaperId(id);
    if (!titleTouched) setTitle(papers.find((p) => p.id === id)?.title ?? "");
  };
  const toggleBatch = (id: string) => setBatchIds((cur) => (cur.includes(id) ? cur.filter((b) => b !== id) : [...cur, id]));
  const assignedTo = batchIds.length ? batches.filter((b) => batchIds.includes(b.id)).map((b) => b.name).join(", ") : "every student in the institute";

  const payload = () => createTestInput.safeParse({
    title, paperId, batchIds, presetKey, durationMinutes: duration, sections: paper?.sections ?? [],
    windowStart: start ? new Date(start).toISOString() : "", windowEnd: end ? new Date(end).toISOString() : "",
  });

  async function create() {
    const p = payload();
    if (!p.success) return setErr(p.error.issues[0]?.message ?? "Invalid");
    setBusy(true); setErr(null);
    try {
      const t = await api<{ id: string }>("/tests", { method: "POST", body: p.data }).catch((e) => { throw new Error(`Create failed: ${errorText(e)}`); });
      await api(`/tests/${t.id}/publish`, { method: "POST" }).catch((e) => { throw new Error(`Publish failed: ${errorText(e)}`); });
      onDone?.(t.id, p.data.title);
      setStep(0);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <ol className="flex flex-wrap gap-2 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-2 rounded-full py-1 pl-1 pr-3 font-semibold", i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
              <span className={cn("flex size-6 items-center justify-center rounded-full text-xs font-extrabold", i === step ? "bg-primary-foreground/20" : "bg-card")}>{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        {step === 0 && (
          <div className="space-y-3">
            <input className={inputCls} placeholder="Test title" value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} />
            <select aria-label="Paper" className={inputCls} value={paperId} onChange={(e) => pickPaper(e.target.value)}>
              {papers.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <ul className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">{paper?.sections.map((s) => <li key={s.name} className="rounded-full bg-muted px-2.5 py-1">{s.name}: {s.questionIds.length} questions</li>)}</ul>
            <fieldset className="space-y-2 rounded-lg border border-border bg-card p-4" aria-label="Batches">
              <legend className="px-1 text-sm font-bold">Batches</legend>
              {batches.length === 0 ? (
                <p className="text-xs text-muted-foreground">No batches yet. The test will be open to every student of the institute.</p>
              ) : (
                <>
                  {batches.map((b) => (
                    <label key={b.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={batchIds.includes(b.id)} onChange={() => toggleBatch(b.id)} />
                      {b.name}{b.year ? <span className="text-xs text-muted-foreground">({b.year})</span> : null}
                    </label>
                  ))}
                  <p className="text-xs text-muted-foreground">Only students enrolled in the selected batches can take the test. Select none to open it to the whole institute.</p>
                </>
              )}
            </fieldset>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-2">
            {PRESET_KEYS.map((k) => (
              <label key={k} className={cn("block cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/60", presetKey === k && "border-primary bg-accent ring-1 ring-primary")}>
                <input type="radio" checked={presetKey === k} onChange={() => setPresetKey(k)} /> <b>{DEFAULT_PRESETS[k].name}</b>
                <div className="text-xs text-muted-foreground">
                  {NAV_LABEL[DEFAULT_PRESETS[k].config.navigation]}. Marking +{DEFAULT_PRESETS[k].config.marking.correct} / {DEFAULT_PRESETS[k].config.marking.wrong}. Strict mode: {STRICT_LABEL[DEFAULT_PRESETS[k].config.strictLevel]}.
                </div>
              </label>
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <label className="block text-xs font-bold">Duration (minutes)<input type="number" min={1} className={cn(inputCls, "mt-1")} value={duration} onChange={(e) => setDuration(+e.target.value)} /></label>
            <label className="block text-xs font-bold">Window opens<input type="datetime-local" className={cn(inputCls, "mt-1")} value={start} onChange={(e) => setWindow((w) => ({ ...w, start: e.target.value }))} /></label>
            <label className="block text-xs font-bold">Window closes<input type="datetime-local" className={cn(inputCls, "mt-1")} value={end} onChange={(e) => setWindow((w) => ({ ...w, end: e.target.value }))} /></label>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-1 text-sm">
            <p>Create and publish <b>{title || "(untitled)"}</b> with the {DEFAULT_PRESETS[presetKey].name} preset?</p>
            <p className="text-muted-foreground">For: {assignedTo}. Window: {start ? new Date(start).toLocaleString() : "?"} to {end ? new Date(end).toLocaleString() : "?"}, {duration} minutes.</p>
          </div>
        )}
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        <div className="flex gap-2">
          {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}
          {step < 3 ? <Button onClick={() => setStep(step + 1)}>Next</Button>
            : <Button disabled={busy} onClick={create}>Publish test</Button>}
        </div>
      </div>
      <aside className="stock h-fit p-5 text-sm">
        <h3 className="mb-3 text-base font-bold">Preset summary</h3>
        <dl className="space-y-2 [&_b]:block [&_b]:text-xs [&_b]:uppercase [&_b]:tracking-wider [&_b]:text-muted-foreground">
          <div><b>Marking</b>+{cfg.marking.correct} correct, {cfg.marking.wrong} wrong</div>
          <div><b>Navigation</b>{NAV_LABEL[cfg.navigation] ?? cfg.navigation}</div>
          <div><b>Question palette</b>{PALETTE_LABEL[cfg.palette] ?? cfg.palette}</div>
          <div><b>Numerical answers</b>{cfg.numeric.enabled ? `Yes, ${cfg.numeric.decimals} decimal places` : "No"}</div>
          <div><b>Strict mode</b>{STRICT_LABEL[cfg.strictLevel] ?? cfg.strictLevel}</div>
        </dl>
      </aside>
    </div>
  );
}

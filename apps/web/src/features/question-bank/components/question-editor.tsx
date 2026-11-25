'use client';
import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Save, Send, Trash2, X } from 'lucide-react';
import { BuilderPage, Button, Input, Label, PanelSection, Select, cn } from '@cbt/ui';
import { QUESTION_TYPES, richDocToText, type DuplicateCandidate, type QuestionPayload } from '@cbt/contracts';
import { fetchTopicChoices, questionApi } from '../api';
import {
  addOption,
  changeType,
  emptyDraft,
  removeOption,
  toggleCorrect,
  validateDraft,
  type QuestionDraft,
} from '../lib/draft';
import { RichTextEditor } from './rich-text-editor';

const TYPE_LABEL: Record<string, string> = {
  mcq_single: 'MCQ (single correct)',
  mcq_multi: 'MCQ (multiple correct)',
  true_false: 'True / False',
  numeric: 'Numerical',
  subjective: 'Subjective',
};

/** Debounced "possible duplicate of Q12" lookup on the stem text. */
function useDuplicates(draft: QuestionDraft, excludeId?: string) {
  const [dups, setDups] = useState<DuplicateCandidate[]>([]);
  const text = richDocToText(draft.stem).trim();
  useEffect(() => {
    if (text.length < 15) return setDups([]);
    const t = setTimeout(() => {
      questionApi.checkDuplicates(text.toLowerCase(), excludeId).then(setDups, () => setDups([]));
    }, 600);
    return () => clearTimeout(t);
  }, [text, excludeId]);
  return dups;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-border bg-card p-4', className)}>
      {title && <h2 className="mb-2 text-sm font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

function Chips({ items, onRemove, label }: { items: Array<{ id: string; text: string }>; onRemove: (id: string) => void; label: string }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {items.map((c) => (
        <li key={c.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs text-primary">
          <span className="truncate">{c.text}</span>
          <button type="button" aria-label={`Remove ${c.text}`} onClick={() => onRemove(c.id)} className="rounded-full p-0.5 hover:bg-primary/20">
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function TagsInput({ id, tags, onChange }: { id: string; tags: string[]; onChange: (t: string[]) => void }) {
  const [text, setText] = useState('');
  const commit = () => {
    const t = text.trim().replace(/,$/, '').trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setText('');
  };
  return (
    <div className="space-y-2">
      <Input
        id={id}
        value={text}
        placeholder="Type a tag and press Enter"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          }
        }}
      />
      <Chips label="Tags" items={tags.map((t) => ({ id: t, text: t }))} onRemove={(t) => onChange(tags.filter((x) => x !== t))} />
    </div>
  );
}

export function QuestionEditor({
  initial,
  questionId,
  onSave,
  title,
  description,
}: {
  initial?: QuestionDraft;
  questionId?: string;
  onSave: (payload: QuestionPayload) => Promise<void> | void;
  title?: string;
  description?: string;
}) {
  const uid = useId();
  const [draft, setDraft] = useState<QuestionDraft>(initial ?? emptyDraft());
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const dups = useDuplicates(draft, questionId);
  const topics = useQuery({ queryKey: ['question-editor', 'topics'], queryFn: fetchTopicChoices, staleTime: 60_000 });
  const patch = (p: Partial<QuestionDraft>) => setDraft((d) => ({ ...d, ...p }));
  const hasOptions = draft.type === 'mcq_single' || draft.type === 'mcq_multi';
  const id = (s: string) => `${uid}-${s}`;
  const topicLabel = (tid: string) => topics.data?.find((t) => t.id === tid)?.label ?? 'Topic';
  const availableTopics = (topics.data ?? []).filter((t) => !draft.topicIds.includes(t.id));

  async function save() {
    const r = validateDraft(draft);
    if (!r.ok) return setErrors(r.errors);
    setErrors([]);
    setSaving(true);
    try {
      await onSave(r.payload);
    } finally {
      setSaving(false);
    }
  }

  const submitLabel = saving ? 'Saving...' : questionId ? 'Save changes' : 'Publish question';
  const SubmitIcon = questionId ? Save : Send;

  const settings = (
    <>
      <PanelSection title="Question settings">
        <Field label="Question type" htmlFor={id('type')}>
          <Select id={id('type')} value={draft.type} onChange={(e) => setDraft(changeType(draft, e.target.value as QuestionDraft['type']))}>
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Topics covered" htmlFor={id('topic')}>
          <Select
            id={id('topic')}
            value=""
            disabled={!availableTopics.length}
            onChange={(e) => e.target.value && patch({ topicIds: [...draft.topicIds, e.target.value] })}
          >
            <option value="">{topics.isLoading ? 'Loading topics...' : availableTopics.length ? 'Add a topic' : 'No topics available'}</option>
            {availableTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
          <Chips
            label="Selected topics"
            items={draft.topicIds.map((t) => ({ id: t, text: topicLabel(t) }))}
            onRemove={(t) => patch({ topicIds: draft.topicIds.filter((x) => x !== t) })}
          />
        </Field>
        <Field label="Grade / Class" htmlFor={id('grade')}>
          <Input id={id('grade')} placeholder="e.g. 11th grade" value={draft.grade} onChange={(e) => patch({ grade: e.target.value })} />
        </Field>
        <Field label="Textbook / Source" htmlFor={id('source')}>
          <Input id={id('source')} placeholder="e.g. NCERT Physics Part 1" value={draft.source} onChange={(e) => patch({ source: e.target.value })} />
        </Field>
        <Field label="Difficulty" htmlFor={id('difficulty')}>
          <Select id={id('difficulty')} value={draft.difficulty} onChange={(e) => patch({ difficulty: e.target.value as QuestionDraft['difficulty'] })}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </Field>
      </PanelSection>
      <PanelSection title="Marking">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marks" htmlFor={id('marks')}>
            <Input id={id('marks')} type="number" min={0} step="0.25" value={draft.marks} onChange={(e) => patch({ marks: Number(e.target.value) })} />
          </Field>
          <Field label="Negative" htmlFor={id('neg')}>
            <Input id={id('neg')} type="number" min={0} step="0.25" value={draft.negativeMarks} onChange={(e) => patch({ negativeMarks: Number(e.target.value) })} />
          </Field>
        </div>
      </PanelSection>
    </>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <BuilderPage
        title={title ?? (questionId ? 'Edit question' : 'New question')}
        description={description ?? 'Write the question, mark the correct answer and publish it to the bank.'}
        panelPosition="left"
        panel={settings}
        actions={
          <Button type="submit" disabled={saving}>
            <SubmitIcon /> {submitLabel}
          </Button>
        }
      >
        <Card title="Question">
          <RichTextEditor value={draft.stem} onChange={(stem) => patch({ stem })} placeholder="Question text" minHeight={120} />
          {dups.length > 0 && (
            <ul role="status" className="mt-2 rounded-md border border-amber-400 bg-amber-50 p-2 text-sm text-amber-900">
              {dups.map((d) => (
                <li key={d.questionId}>
                  Possible duplicate of <strong>{d.label}</strong> ({Math.round(d.similarity * 100)}% similar): {d.snippet}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {hasOptions && (
          <section aria-label="Options" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              {draft.options.map((o) => {
                const correct = draft.correct.includes(o.id);
                return (
                  <div key={o.id} className={cn('min-w-0 rounded-lg border bg-card p-3', correct ? 'border-primary ring-1 ring-primary' : 'border-border')}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                        <input
                          aria-label={`Option ${o.id} is correct`}
                          type={draft.type === 'mcq_multi' ? 'checkbox' : 'radio'}
                          name="correct"
                          className="size-4 accent-primary"
                          checked={correct}
                          onChange={() => setDraft(toggleCorrect(draft, o.id))}
                        />
                        Choice {o.id}
                        {correct && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-normal text-primary">Correct</span>}
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground"
                        aria-label={`Remove option ${o.id}`}
                        disabled={draft.options.length <= 2}
                        onClick={() => setDraft(removeOption(draft, o.id))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <RichTextEditor
                      minHeight={48}
                      placeholder={`Choice ${o.id}`}
                      value={o.content}
                      onChange={(content) => patch({ options: draft.options.map((x) => (x.id === o.id ? { ...x, content } : x)) })}
                    />
                  </div>
                );
              })}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft(addOption(draft))} disabled={draft.options.length >= 8}>
              <Plus /> Add option
            </Button>
          </section>
        )}

        {draft.type === 'true_false' && (
          <Card title="Correct answer">
            <fieldset className="flex gap-6 text-sm">
              {(['true', 'false'] as const).map((v) => (
                <label key={v} className="flex items-center gap-2">
                  <input type="radio" name="tf" className="size-4 accent-primary" checked={draft.correct[0] === v} onChange={() => patch({ correct: [v] })} />
                  {v === 'true' ? 'True' : 'False'}
                </label>
              ))}
            </fieldset>
          </Card>
        )}

        {draft.type === 'numeric' && (
          <Card title="Numerical answer">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Answer" htmlFor={id('ans')}>
                <Input id={id('ans')} type="number" step="any" value={draft.numeric.answer ?? ''} onChange={(e) => patch({ numeric: { ...draft.numeric, answer: e.target.value === '' ? null : Number(e.target.value) } })} />
              </Field>
              <Field label="Tolerance" htmlFor={id('tol')}>
                <Input id={id('tol')} type="number" min={0} step="any" value={draft.numeric.tolerance} onChange={(e) => patch({ numeric: { ...draft.numeric, tolerance: Number(e.target.value) } })} />
              </Field>
              <Field label="Tolerance type" htmlFor={id('tolkind')}>
                <Select id={id('tolkind')} value={draft.numeric.toleranceKind} onChange={(e) => patch({ numeric: { ...draft.numeric, toleranceKind: e.target.value as 'absolute' | 'percent' } })}>
                  <option value="absolute">Absolute</option>
                  <option value="percent">Percent</option>
                </Select>
              </Field>
            </div>
          </Card>
        )}

        <Card title="Explanation / solution (optional)">
          <RichTextEditor value={draft.explanation} onChange={(explanation) => patch({ explanation })} placeholder="Explanation" />
        </Card>

        <Card title="Details">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tags" htmlFor={id('tags')}>
              <TagsInput id={id('tags')} tags={draft.tags} onChange={(tags) => patch({ tags })} />
            </Field>
            <Field label="Author" htmlFor={id('author')}>
              <Input id={id('author')} placeholder="Author name" value={draft.author} onChange={(e) => patch({ author: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Learning outcomes" htmlFor={id('outcomes')}>
                <Input id={id('outcomes')} placeholder="Outcome 1, Outcome 2" value={draft.learningOutcomes} onChange={(e) => patch({ learningOutcomes: e.target.value })} />
              </Field>
            </div>
          </div>
        </Card>

        {errors.length > 0 && (
          <ul role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={saving}>
            <SubmitIcon /> {submitLabel}
          </Button>
        </div>
      </BuilderPage>
    </form>
  );
}

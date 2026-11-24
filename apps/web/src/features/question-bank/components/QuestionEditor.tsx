'use client';
import { useEffect, useState } from 'react';
import { QUESTION_TYPES, richDocToText, type DuplicateCandidate, type QuestionPayload } from '@cbt/contracts';
import { questionApi } from '../api';
import {
  addOption,
  changeType,
  emptyDraft,
  removeOption,
  toggleCorrect,
  validateDraft,
  type QuestionDraft,
} from '../lib/draft';
import { RichTextEditor } from './RichTextEditor';

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

export function QuestionEditor({
  initial,
  questionId,
  onSave,
}: {
  initial?: QuestionDraft;
  questionId?: string;
  onSave: (payload: QuestionPayload) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<QuestionDraft>(initial ?? emptyDraft());
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const dups = useDuplicates(draft, questionId);
  const patch = (p: Partial<QuestionDraft>) => setDraft((d) => ({ ...d, ...p }));
  const hasOptions = draft.type === 'mcq_single' || draft.type === 'mcq_multi';

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

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          Type
          <select className="ml-2 rounded border p-1" value={draft.type} onChange={(e) => setDraft(changeType(draft, e.target.value as QuestionDraft['type']))}>
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Difficulty
          <select className="ml-2 rounded border p-1" value={draft.difficulty} onChange={(e) => patch({ difficulty: e.target.value as QuestionDraft['difficulty'] })}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label className="text-sm">
          Marks
          <input type="number" min={0} step="0.25" className="ml-2 w-20 rounded border p-1" value={draft.marks} onChange={(e) => patch({ marks: Number(e.target.value) })} />
        </label>
        <label className="text-sm">
          Negative
          <input type="number" min={0} step="0.25" className="ml-2 w-20 rounded border p-1" value={draft.negativeMarks} onChange={(e) => patch({ negativeMarks: Number(e.target.value) })} />
        </label>
      </div>

      <section>
        <h3 className="mb-1 text-sm font-medium">Question</h3>
        <RichTextEditor value={draft.stem} onChange={(stem) => patch({ stem })} placeholder="Question text" />
        {dups.length > 0 && (
          <ul role="status" className="mt-2 rounded border border-amber-400 bg-amber-50 p-2 text-sm text-amber-900">
            {dups.map((d) => (
              <li key={d.questionId}>
                Possible duplicate of <strong>{d.label}</strong> ({Math.round(d.similarity * 100)}% similar): {d.snippet}
              </li>
            ))}
          </ul>
        )}
      </section>

      {hasOptions && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Options</h3>
          {draft.options.map((o) => (
            <div key={o.id} className="flex items-start gap-2">
              <input
                aria-label={`Option ${o.id} is correct`}
                type={draft.type === 'mcq_multi' ? 'checkbox' : 'radio'}
                name="correct"
                className="mt-3"
                checked={draft.correct.includes(o.id)}
                onChange={() => setDraft(toggleCorrect(draft, o.id))}
              />
              <span className="mt-2 w-5 font-medium">{o.id}</span>
              <div className="flex-1">
                <RichTextEditor
                  minHeight={32}
                  value={o.content}
                  onChange={(content) => patch({ options: draft.options.map((x) => (x.id === o.id ? { ...x, content } : x)) })}
                />
              </div>
              <button type="button" aria-label={`Remove option ${o.id}`} className="mt-2" onClick={() => setDraft(removeOption(draft, o.id))}>
                x
              </button>
            </div>
          ))}
          <button type="button" className="text-sm underline" onClick={() => setDraft(addOption(draft))}>
            Add option
          </button>
        </section>
      )}

      {draft.type === 'true_false' && (
        <fieldset className="flex gap-4 text-sm">
          {(['true', 'false'] as const).map((v) => (
            <label key={v}>
              <input type="radio" name="tf" checked={draft.correct[0] === v} onChange={() => patch({ correct: [v] })} /> {v === 'true' ? 'True' : 'False'}
            </label>
          ))}
        </fieldset>
      )}

      {draft.type === 'numeric' && (
        <div className="flex flex-wrap gap-3 text-sm">
          <label>
            Answer
            <input type="number" step="any" className="ml-2 w-32 rounded border p-1" value={draft.numeric.answer ?? ''} onChange={(e) => patch({ numeric: { ...draft.numeric, answer: e.target.value === '' ? null : Number(e.target.value) } })} />
          </label>
          <label>
            Tolerance
            <input type="number" min={0} step="any" className="ml-2 w-24 rounded border p-1" value={draft.numeric.tolerance} onChange={(e) => patch({ numeric: { ...draft.numeric, tolerance: Number(e.target.value) } })} />
          </label>
          <select className="rounded border p-1" value={draft.numeric.toleranceKind} onChange={(e) => patch({ numeric: { ...draft.numeric, toleranceKind: e.target.value as 'absolute' | 'percent' } })}>
            <option value="absolute">absolute</option>
            <option value="percent">percent</option>
          </select>
        </div>
      )}

      <section>
        <h3 className="mb-1 text-sm font-medium">Explanation / solution (optional)</h3>
        <RichTextEditor value={draft.explanation} onChange={(explanation) => patch({ explanation })} placeholder="Explanation" />
      </section>

      {errors.length > 0 && (
        <ul role="alert" className="text-sm text-red-600">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button type="submit" disabled={saving} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
        {saving ? 'Saving...' : questionId ? 'Save new version' : 'Create question'}
      </button>
    </form>
  );
}

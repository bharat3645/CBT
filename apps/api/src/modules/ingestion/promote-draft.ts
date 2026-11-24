import { questionPayloadSchema, type Draft, type QuestionPayload, type RichDoc } from '@cbt/contracts';
import { effectiveAnswer } from './approval-gate';

/** Split text into Tiptap inline nodes; `$...$` and `\(...\)` become inlineMath nodes. */
export function textToInline(text: string): RichDoc[] {
  const out: RichDoc[] = [];
  const re = /\$([^$\n]+)\$|\\\(([^\n]+?)\\\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    out.push({ type: 'inlineMath', attrs: { latex: (m[1] ?? m[2]!).trim() } });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/** Plain text (with optional LaTeX segments) to a Tiptap doc, one paragraph per non-empty line. */
export function textToDoc(text: string): RichDoc {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const paras = (lines.length ? lines : ['']).map((l) => {
    const content = textToInline(l);
    return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
  });
  return { type: 'doc', content: paras };
}

const AR_OPTIONS = [
  'Both Assertion and Reason are true and Reason is the correct explanation of Assertion',
  'Both Assertion and Reason are true but Reason is not the correct explanation of Assertion',
  'Assertion is true but Reason is false',
  'Assertion is false but Reason is true',
];

/** Map a reviewed draft + its effective answer to a validated question payload. Throws on invalid content. */
export function draftToPayload(draft: Draft, key: Record<string, string>): QuestionPayload {
  const answer = (effectiveAnswer(draft, key) ?? '').trim();
  const stem = textToDoc(draft.stem);
  let raw: unknown;

  if (draft.type === 'numeric') {
    const n = Number(answer);
    raw = Number.isFinite(n) && answer !== ''
      ? { type: 'numeric', stem, numeric: { answer: n, tolerance: 0, toleranceKind: 'absolute' } }
      : { type: 'subjective', stem, modelAnswer: textToDoc(answer) };
  } else {
    const options =
      draft.options.length >= 2
        ? draft.options.map((o) => ({ id: o.label.trim().toUpperCase(), content: textToDoc(o.text) }))
        : draft.type === 'assertion_reason'
          ? AR_OPTIONS.map((t, i) => ({ id: 'ABCD'[i]!, content: textToDoc(t) }))
          : null;
    if (!options) {
      raw = { type: 'subjective', stem, modelAnswer: textToDoc(answer) };
    } else {
      const correct = [...new Set(answer.toUpperCase().split(/[\s,;/&]+|(?<=[A-Z])(?=[A-Z])/).filter(Boolean))];
      raw = { type: correct.length > 1 ? 'mcq_multi' : 'mcq_single', stem, options, correct };
    }
  }
  const parsed = questionPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Question ${draft.number}: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  return parsed.data;
}

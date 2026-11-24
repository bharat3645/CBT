'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApprovalBlocked, Draft } from '@cbt/contracts';
import { ApprovalBlockedError, paperApi } from './api';

const LABEL_STYLE: Record<Draft['label'], string> = {
  EXTRACTED: 'bg-emerald-100 text-emerald-800',
  'AI-INFERRED': 'bg-amber-100 text-amber-800',
  MANUAL: 'bg-sky-100 text-sky-800',
};

const openErrors = (d: Draft) => d.flags.filter((f) => f.severity === 'error' && !f.resolved);

/**
 * Side-by-side conversion review: original document on the left, extracted drafts on the right.
 * Selecting a draft jumps the original to its source page/region. Edits flip the label to MANUAL.
 */
export function PaperReviewEditor({ paperId }: { paperId: string }) {
  const qc = useQueryClient();
  const { data: paper, isLoading, error } = useQuery({
    queryKey: ['paper', paperId],
    queryFn: () => paperApi.get(paperId),
    refetchInterval: (q) => (q.state.data?.status === 'parsing' ? 3000 : false),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [keyText, setKeyText] = useState('');
  const [blocked, setBlocked] = useState<ApprovalBlocked | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['paper', paperId] });
  const saveDraft = useMutation({
    mutationFn: (a: { id: string; patch: Parameters<typeof paperApi.updateDraft>[2] }) =>
      paperApi.updateDraft(paperId, a.id, a.patch),
    onSuccess: refresh,
  });
  const saveKey = useMutation({
    mutationFn: () => paperApi.setAnswerKey(paperId, { text: keyText }),
    onSuccess: () => {
      setKeyText('');
      refresh();
    },
  });
  const approve = useMutation({
    mutationFn: () => paperApi.approve(paperId),
    onSuccess: () => {
      setBlocked(null);
      refresh();
    },
    onError: (e) => e instanceof ApprovalBlockedError && setBlocked(e.body),
  });

  const drafts = useMemo(
    () => (paper?.drafts ?? []).filter((d) => !onlyFlagged || openErrors(d).length > 0),
    [paper, onlyFlagged],
  );
  const selected = paper?.drafts.find((d) => d.id === selectedId) ?? null;

  if (isLoading) return <p className="p-6 text-sm">Loading paper...</p>;
  if (error || !paper) return <p className="p-6 text-sm text-red-600">Could not load paper.</p>;
  if (paper.status === 'parsing') return <p className="p-6 text-sm">Converting document... this page updates automatically.</p>;
  if (paper.status === 'failed' || paper.status === 'rejected')
    return <p className="p-6 text-sm text-red-600">Paper {paper.status}: {paper.parseError ?? 'see scan result'}</p>;

  const frozen = paper.status === 'approved';
  const isPdf = paper.filename.toLowerCase().endsWith('.pdf');
  const page = selected?.source.page ?? 1;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <h1 className="text-base font-semibold">{paper.title}</h1>
        <span className="text-xs text-neutral-500">
          {paper.questionCount} questions, {paper.openFlagCount} open flags, {paper.missingKeyCount} without key
        </span>
        <label className="ml-auto flex items-center gap-1 text-xs">
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
          Only flagged
        </label>
        <button
          disabled={frozen || approve.isPending}
          onClick={() => approve.mutate()}
          className="rounded bg-emerald-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {frozen ? 'Approved (frozen)' : 'Approve paper'}
        </button>
      </header>

      {blocked && (
        <div role="alert" className="border-b bg-red-50 px-4 py-2 text-sm text-red-800">
          <strong>Cannot approve:</strong> {blocked.message}
          {blocked.openFlags.length > 0 && (
            <div>
              Open flags:{' '}
              {blocked.openFlags.map((f) => (
                <button key={f.draftId} className="mr-2 underline" onClick={() => setSelectedId(f.draftId)}>
                  Q{f.number}
                </button>
              ))}
            </div>
          )}
          {blocked.missingKey.length > 0 && <div>Missing answer: Q{blocked.missingKey.join(', Q')}</div>}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-2">
        {/* Original pane */}
        <section className="min-h-0 overflow-auto border-r bg-neutral-100" aria-label="Original document">
          {paper.originalUrl && isPdf ? (
            <iframe title="Original" src={`${paper.originalUrl}#page=${page}`} className="h-full w-full" />
          ) : (
            <div className="p-4 text-sm">
              <p className="mb-2 text-neutral-600">
                DOCX has no fixed pages.{' '}
                {paper.originalUrl && (
                  <a className="underline" href={paper.originalUrl}>
                    Download original
                  </a>
                )}
              </p>
              {selected && (
                <p className="rounded border bg-white p-2 text-xs">
                  Source paragraphs {selected.source.blockStart} to {selected.source.blockEnd}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Drafts pane */}
        <section className="flex min-h-0 flex-col" aria-label="Extracted questions">
          <div className="border-b p-2">
            <textarea
              value={keyText}
              onChange={(e) => setKeyText(e.target.value)}
              placeholder="Paste answer key, e.g. 1-A, 2-C, 3-B"
              disabled={frozen}
              className="h-14 w-full rounded border p-1 text-xs"
            />
            <button
              disabled={frozen || !keyText.trim() || saveKey.isPending}
              onClick={() => saveKey.mutate()}
              className="mt-1 rounded border px-2 py-0.5 text-xs disabled:opacity-50"
            >
              Map answer key
            </button>
            {saveKey.isError && <span className="ml-2 text-xs text-red-600">{(saveKey.error as Error).message}</span>}
          </div>
          <ul className="min-h-0 flex-1 overflow-auto">
            {drafts.map((d) => (
              <DraftRow
                key={d.id}
                draft={d}
                keyAnswer={paper.answerKey[String(d.number)] ?? null}
                selected={d.id === selectedId}
                frozen={frozen}
                onSelect={() => setSelectedId(d.id)}
                onSave={(patch) => saveDraft.mutate({ id: d.id, patch })}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function DraftRow(props: {
  draft: Draft;
  keyAnswer: string | null;
  selected: boolean;
  frozen: boolean;
  onSelect: () => void;
  onSave: (patch: { stem?: string; options?: Draft['options']; answer?: string | null; resolveFlags?: string[] }) => void;
}) {
  const { draft: d, selected, frozen } = props;
  const [stem, setStem] = useState(d.stem);
  const [options, setOptions] = useState(d.options);
  const dirty = stem !== d.stem || JSON.stringify(options) !== JSON.stringify(d.options);
  const low = d.confidence < 0.7;

  return (
    <li
      onClick={props.onSelect}
      className={`border-b p-3 text-sm ${selected ? 'bg-sky-50' : ''} ${openErrors(d).length ? 'border-l-4 border-l-red-500' : ''}`}
    >
      <div className="mb-1 flex items-center gap-2 text-xs">
        <b>Q{d.number}</b>
        {d.section && <span className="text-neutral-500">{d.section}</span>}
        <span className={`rounded px-1.5 py-0.5 ${LABEL_STYLE[d.label]}`}>{d.label}</span>
        <span className={low ? 'font-semibold text-red-600' : 'text-neutral-500'}>
          {Math.round(d.confidence * 100)}%
        </span>
        <span className="ml-auto text-neutral-500">
          Key: {d.answer ?? props.keyAnswer ?? <em className="text-red-600">missing</em>}
        </span>
      </div>
      <textarea
        value={stem}
        disabled={frozen}
        onChange={(e) => setStem(e.target.value)}
        className="w-full rounded border p-1"
        rows={2}
      />
      {options.map((o, i) => (
        <div key={o.label} className="mt-1 flex items-center gap-1">
          <span className="w-6 text-xs font-medium">{o.label}</span>
          <input
            value={o.text}
            disabled={frozen}
            onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
            className="flex-1 rounded border px-1 py-0.5"
          />
          <button
            disabled={frozen}
            title="Mark as correct answer"
            onClick={() => props.onSave({ answer: o.label })}
            className={`rounded border px-1 text-xs ${(d.answer ?? props.keyAnswer) === o.label ? 'bg-emerald-100' : ''}`}
          >
            Key
          </button>
        </div>
      ))}
      {d.type === 'numeric' && (
        <input
          defaultValue={d.answer ?? ''}
          disabled={frozen}
          placeholder="Numeric answer"
          onBlur={(e) => e.target.value !== (d.answer ?? '') && props.onSave({ answer: e.target.value || null })}
          className="mt-1 rounded border px-1 py-0.5"
        />
      )}
      {d.flags.length > 0 && (
        <ul className="mt-2 space-y-1">
          {d.flags.map((f) => (
            <li key={f.code} className="flex items-center gap-2 text-xs">
              <span className={f.resolved ? 'text-neutral-400 line-through' : f.severity === 'error' ? 'text-red-700' : 'text-amber-700'}>
                {f.message}
              </span>
              {!f.resolved && !frozen && (
                <button className="underline" onClick={() => props.onSave({ resolveFlags: [f.code] })}>
                  Mark resolved
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {dirty && !frozen && (
        <button
          className="mt-2 rounded bg-sky-600 px-2 py-0.5 text-xs text-white"
          onClick={() => props.onSave({ stem, options })}
        >
          Save edits
        </button>
      )}
    </li>
  );
}

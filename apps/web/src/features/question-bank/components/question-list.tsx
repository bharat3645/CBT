'use client';
import { useEffect, useMemo, useState } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { DIFFICULTIES, QUESTION_TYPES, type QuestionSummary, type SearchQuestions } from '@cbt/contracts';
import { Button, cn } from '@cbt/ui';
import { inputCls } from '@/components/ui-kit';
import { questionApi } from '../api';
import { TYPE_LABEL, readableMath } from './readable-math';

const DIFF_TONE: Record<string, string> = { easy: 'bg-exam-answered/12 text-exam-answered', medium: 'bg-exam-flagged/20 text-foreground', hard: 'bg-destructive/10 text-destructive' };

export interface TopicOption {
  id: string;
  label: string;
}

/** Server-side paginated + filtered question bank table (TanStack Table, manual pagination). */
export function QuestionList({
  topics = [],
  onOpen,
  fetcher = questionApi.search,
}: {
  topics?: TopicOption[];
  onOpen?: (q: QuestionSummary) => void;
  fetcher?: (q: Partial<SearchQuestions>) => Promise<{ items: QuestionSummary[]; total: number }>;
}) {
  const [filters, setFilters] = useState<Partial<SearchQuestions>>({});
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [data, setData] = useState<{ items: QuestionSummary[]; total: number }>({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetcher({ ...filters, page, pageSize })
      .then((r) => live && setData(r))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [filters, page, pageSize, fetcher]);

  const columns = useMemo<ColumnDef<QuestionSummary>[]>(
    () => [
      { accessorKey: 'code', header: 'ID', cell: (c) => <span className="font-bold text-muted-foreground">{c.getValue<string>()}</span> },
      { accessorKey: 'snippet', header: 'Question', cell: (c) => <span className="line-clamp-2 font-semibold">{readableMath(c.getValue<string>())}</span> },
      { accessorKey: 'type', header: 'Type', cell: (c) => <span className="whitespace-nowrap">{TYPE_LABEL[c.getValue<string>()] ?? c.getValue<string>()}</span> },
      { accessorKey: 'difficulty', header: 'Difficulty', cell: (c) => <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold capitalize', DIFF_TONE[c.getValue<string>()] ?? 'bg-muted')}>{c.getValue<string>()}</span> },
      { accessorKey: 'currentVersion', header: 'Ver.', cell: (c) => `v${c.getValue<number>()}` },
      { accessorKey: 'updatedAt', header: 'Updated', cell: (c) => <span className="whitespace-nowrap text-muted-foreground">{new Date(c.getValue<string>()).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span> },
    ],
    [],
  );

  const table = useReactTable({
    data: data.items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: data.total,
  });

  const set = (p: Partial<SearchQuestions>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...p }));
  };
  const pages = Math.max(1, Math.ceil(data.total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <input aria-label="Search questions" placeholder="Search text or code" className={cn(inputCls, 'w-64')} onChange={(e) => set({ q: e.target.value || undefined })} />
        <select aria-label="Topic" className={cn(inputCls, 'w-auto')} onChange={(e) => set({ topicId: e.target.value || undefined })}>
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select aria-label="Difficulty" className={cn(inputCls, 'w-auto capitalize')} onChange={(e) => set({ difficulty: (e.target.value || undefined) as SearchQuestions['difficulty'] })}>
          <option value="">Any difficulty</option>
          {DIFFICULTIES.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select aria-label="Type" className={cn(inputCls, 'w-auto')} onChange={(e) => set({ type: (e.target.value || undefined) as SearchQuestions['type'] })}>
          <option value="">Any type</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>
          ))}
        </select>
      </div>

      <div className="stock overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm" aria-busy={loading}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="border-b bg-muted/50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="cursor-pointer transition-colors hover:bg-muted/60" onClick={() => onOpen?.(row.original)}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="border-b px-4 py-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {!loading && data.items.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="p-4 text-center text-muted-foreground">
                No questions match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-muted-foreground">
          Page {page} of {pages}, {data.total} questions
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

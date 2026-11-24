'use client';
import { useEffect, useMemo, useState } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { DIFFICULTIES, QUESTION_TYPES, type QuestionSummary, type SearchQuestions } from '@cbt/contracts';
import { questionApi } from '../api';

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
      { accessorKey: 'code', header: 'ID' },
      { accessorKey: 'snippet', header: 'Question', cell: (c) => <span className="line-clamp-2">{c.getValue<string>()}</span> },
      { accessorKey: 'type', header: 'Type' },
      { accessorKey: 'difficulty', header: 'Difficulty' },
      { accessorKey: 'currentVersion', header: 'Ver.', cell: (c) => `v${c.getValue<number>()}` },
      { accessorKey: 'updatedAt', header: 'Updated', cell: (c) => new Date(c.getValue<string>()).toLocaleDateString() },
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
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <input aria-label="Search questions" placeholder="Search text or code" className="rounded border p-1" onChange={(e) => set({ q: e.target.value || undefined })} />
        <select aria-label="Topic" className="rounded border p-1" onChange={(e) => set({ topicId: e.target.value || undefined })}>
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select aria-label="Difficulty" className="rounded border p-1" onChange={(e) => set({ difficulty: (e.target.value || undefined) as SearchQuestions['difficulty'] })}>
          <option value="">Any difficulty</option>
          {DIFFICULTIES.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select aria-label="Type" className="rounded border p-1" onChange={(e) => set({ type: (e.target.value || undefined) as SearchQuestions['type'] })}>
          <option value="">Any type</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      <table className="w-full text-left text-sm" aria-busy={loading}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="border-b p-2">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="cursor-pointer hover:bg-muted" onClick={() => onOpen?.(row.original)}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="border-b p-2">
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

      <div className="flex items-center gap-2 text-sm">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {pages} ({data.total} questions)
        </span>
        <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

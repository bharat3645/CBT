"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PaperSummary } from "@cbt/contracts";
import { PaperReviewEditor, paperApi } from "@/features/paper-review";

export function PaperUploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setErr("Choose a DOCX or PDF file");
    setBusy(true);
    setErr(null);
    try {
      // multipart POST /api/v1/ingestion/papers
      const r = await paperApi.upload(file, title.trim() || undefined);
      router.push(`/teacher/papers/${r.id}`);
    } catch (x: any) {
      setErr(x?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Upload paper</h1>
      <input aria-label="Title" placeholder="Title (optional)" className="w-full rounded border px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input aria-label="Paper file" type="file" accept=".docx,.pdf" className="block text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <button disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy ? "Uploading..." : "Upload and convert"}</button>
    </form>
  );
}

export function PaperList({ title, filter, base = "/teacher" }: { title: string; filter: (p: PaperSummary) => boolean; base?: string }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["papers"], queryFn: paperApi.list });
  const rows = (data ?? []).filter(filter);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p role="alert" className="text-sm">Could not load papers.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b p-2">Paper</th>
              <th className="border-b p-2">Status</th>
              <th className="border-b p-2">Questions</th>
              <th className="border-b p-2">Open flags</th>
              <th className="border-b p-2">Missing keys</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-muted">
                <td className="border-b p-2"><Link className="underline" href={`${base}/papers/${p.id}`}>{p.title || p.filename}</Link></td>
                <td className="border-b p-2">{p.status}</td>
                <td className="border-b p-2">{p.questionCount}</td>
                <td className="border-b p-2">{p.openFlagCount}</td>
                <td className="border-b p-2">{p.missingKeyCount}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

export const PaperReviewPage = ({ paperId }: { paperId: string }) => <PaperReviewEditor paperId={paperId} />;

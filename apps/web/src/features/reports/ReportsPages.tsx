"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3, Download, LineChart, Trophy } from "lucide-react";
import { Button, Card } from "@cbt/ui";
import { PageHeader } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Field, Loading, Panel, Table, Td, errorText, inputCls } from "@/components/ui-kit";
import { downloadCsv, useBatches } from "@/features/people/api";
import { BatchAnalyticsView, useBatchAnalytics } from "@/features/results";

const csvPath = (batchId: string) => `/analytics/batch.csv${batchId ? `?batchId=${batchId}` : ""}`;

function BatchSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const batches = useBatches();
  return (
    <Field label="Batch" className="w-64">
      <select aria-label="Batch" className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All batches</option>
        {(batches.data ?? []).map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ExportButton({ batchId, label = "Export CSV" }: { batchId: string; label?: string }) {
  const [err, setErr] = React.useState<string | null>(null);
  return (
    <>
      <Button
        variant="outline"
        onClick={async () => {
          setErr(null);
          try {
            await downloadCsv(csvPath(batchId), "batch-analytics.csv");
          } catch (e) {
            setErr(errorText(e));
          }
        }}
      >
        <Download /> {label}
      </Button>
      {err && <ErrorNote error={new Error(err)} />}
    </>
  );
}

/** Admin results: every test with results, filterable by batch; drill into one test for the distribution and reteach list. */
export function ResultsOverviewPage() {
  const [batchId, setBatchId] = React.useState("");
  const [testId, setTestId] = React.useState("");
  const a = useBatchAnalytics({ batchId: batchId || undefined });

  return (
    <>
      <PageHeader title="Results" subtitle="Scores for every evaluated test. Open a test for its distribution, weak topics and leaderboard." actions={<ExportButton batchId={batchId} />} />
      <div className="space-y-6">
        <BatchSelect
          value={batchId}
          onChange={(v) => {
            setBatchId(v);
            setTestId("");
          }}
        />
        {a.isLoading ? (
          <Loading />
        ) : a.error ? (
          <ErrorNote error={a.error} />
        ) : !a.data?.tests.length ? (
          <EmptyState>No evaluated tests yet{batchId ? " for this batch" : ""}. Results appear once students submit.</EmptyState>
        ) : (
          <Table head={["Test", "Students", "Average", "Median", ""]}>
            {a.data.tests.map((t) => (
              <tr key={t.testId} className={testId === t.testId ? "bg-accent/40" : undefined}>
                <Td className="font-medium">{t.title ?? `Test ${t.testId.slice(0, 8)}`}</Td>
                <Td>{t.participants}</Td>
                <Td>{t.avgPct}%</Td>
                <Td>{t.medianPct}%</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-3 text-xs">
                    <button className="text-accent-foreground hover:underline" onClick={() => setTestId(testId === t.testId ? "" : t.testId)}>
                      {testId === t.testId ? "Hide analysis" : "Analysis"}
                    </button>
                    <Link className="text-accent-foreground hover:underline" href={`/admin/tests/${t.testId}/leaderboard`}>
                      Leaderboard
                    </Link>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
        {testId && (
          <Panel title="Test analysis">
            <BatchAnalyticsView batchId={batchId || undefined} testId={testId} />
          </Panel>
        )}
      </div>
    </>
  );
}

/** Admin reports hub: links out to the analytics pages and the CSV export, per batch. */
export function ReportsPage() {
  const batches = useBatches();
  return (
    <>
      <PageHeader title="Reports" subtitle="Analytics and exports built from released and evaluated results." />
      <div className="grid gap-4 md:grid-cols-3">
        <ReportCard href="/admin/results" icon={<BarChart3 className="size-5" />} title="Results and analytics" text="Average, median and distribution per test, weak topics, and students whose scores keep dropping." />
        <ReportCard href="/admin/tests" icon={<Trophy className="size-5" />} title="Tests and leaderboards" text="Schedule tests, then open a test to see its ranked leaderboard." />
        <ReportCard href="/admin/syllabus" icon={<LineChart className="size-5" />} title="Syllabus progress" text="How far each batch has got through the syllabus." />
      </div>

      <Panel className="mt-6" title="Export test summaries (CSV)" description="One row per test: students, average and median score.">
        {batches.isLoading ? (
          <Loading />
        ) : (
          <Table head={["Batch", "Students", ""]}>
            <tr>
              <Td className="font-medium">All batches</Td>
              <Td>{(batches.data ?? []).reduce((s, b) => s + b.studentCount, 0)}</Td>
              <Td className="text-right">
                <ExportButton batchId="" label="Download" />
              </Td>
            </tr>
            {(batches.data ?? []).map((b) => (
              <tr key={b.id}>
                <Td className="font-medium">{b.name}</Td>
                <Td>{b.studentCount}</Td>
                <Td className="text-right">
                  <ExportButton batchId={b.id} label="Download" />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}

function ReportCard({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link href={href} className="block">
      <Card className="h-full p-4 transition-colors hover:bg-muted/50">
        <div className="mb-2 text-primary">{icon}</div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{text}</p>
      </Card>
    </Link>
  );
}

"use client";
import { useState } from "react";
import { PageHeader } from "@/components/dashboard-kit";
import { Field, inputCls } from "@/components/ui-kit";
import { useBatches } from "@/features/people/api";
import { BatchAnalyticsView, StudentAnalyticsView } from "@/features/results";
import { StudentGaps } from "@/features/results/student-gaps";

export function BatchInsightsPage({ title = "Insights" }: { title?: string }) {
  const batches = useBatches();
  const [batchId, setBatchId] = useState("");
  return (
    <>
      <PageHeader title={title} subtitle="How your batches are doing, and where each student stands against the class." />
      <div className="space-y-12">
        <section id="student-gaps" className="scroll-mt-24">
          <h2 className="mb-1 text-xl font-bold">Per-student gaps</h2>
          <p className="mb-5 text-sm text-muted-foreground">Pick a student to see their score against the class average in every test, and the topics they need help with.</p>
          <StudentGaps />
        </section>
        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="mb-1 text-xl font-bold">Class overview</h2>
              <p className="text-sm text-muted-foreground">Averages, score spread and topics to reteach.</p>
            </div>
            <Field label="Batch" className="w-64">
              <select aria-label="Batch" className={inputCls} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                <option value="">All my batches</option>
                {(batches.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <BatchAnalyticsView batchId={batchId || undefined} />
        </section>
      </div>
    </>
  );
}

export function StudentInsightsPage() {
  return (
    <>
      <PageHeader title="Weak topics and analytics" subtitle="Your score over time, accuracy by topic, and what to practise next." />
      <StudentAnalyticsView />
    </>
  );
}

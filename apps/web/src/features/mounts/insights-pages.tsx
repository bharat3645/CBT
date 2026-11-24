"use client";
import { useState } from "react";
import { BatchAnalyticsView, StudentAnalyticsView } from "@/features/results";

export function BatchInsightsPage({ title = "Insights" }: { title?: string }) {
  const [batchId, setBatchId] = useState("");
  const [testId, setTestId] = useState("");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <div className="flex gap-2 text-sm">
        <input aria-label="Batch id" placeholder="Batch id" className="rounded border p-1" value={batchId} onChange={(e) => setBatchId(e.target.value.trim())} />
        <input aria-label="Test id" placeholder="Test id" className="rounded border p-1" value={testId} onChange={(e) => setTestId(e.target.value.trim())} />
      </div>
      <BatchAnalyticsView batchId={batchId || undefined} testId={testId || undefined} />
    </div>
  );
}

export function StudentInsightsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Weak topics and analytics</h1>
      <StudentAnalyticsView />
    </div>
  );
}

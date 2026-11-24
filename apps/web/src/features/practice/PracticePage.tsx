"use client";

import Link from "next/link";
import { PageHeader, Bar } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Loading, PhaseCard, Panel } from "@/components/ui-kit";
import { useDashboard } from "@/features/dashboards/api";

/**
 * Practice mode (self-paced question sets) is Phase 2. What is real today: the topics where this student is weakest,
 * computed from their released results, so they know where to put their time.
 */
export function PracticePage() {
  const dash = useDashboard();
  const data = dash.data?.role === "student" ? dash.data : undefined;
  return (
    <>
      <PageHeader title="Practice" subtitle="Build skill between tests." />
      <div className="space-y-6">
        <PhaseCard title="Practice mode">
          Self-paced practice sets are coming in Phase 2. Practice questions are not shown yet because the question bank also holds answer keys that must stay hidden from students.
        </PhaseCard>
        <Panel title="Where to focus" description="Your lowest-accuracy topics from released results.">
          {dash.isLoading ? (
            <Loading />
          ) : dash.error ? (
            <ErrorNote error={dash.error} />
          ) : !data?.weakTopics.length ? (
            <EmptyState>Topic accuracy appears after your first released result.</EmptyState>
          ) : (
            <div className="space-y-3">
              {data.weakTopics.map((t) => (
                <Bar key={t.topicId} label={t.topicName} value={t.accuracy} color={t.accuracy < 40 ? "bg-exam-not-answered" : "bg-exam-flagged"} />
              ))}
              <Link href="/student/weak-topics" className="inline-block pt-1 text-xs font-medium text-accent-foreground hover:underline">
                See all weak topics and recommendations
              </Link>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

"use client";
import { richDocToText, type RichDoc } from "@cbt/contracts";
import { ExamScreen } from "@/features/cbt/components/exam-screen";
import type { ExamQuestion } from "@/features/cbt/lib/exam-machine";
import { AbilityProvider, Can } from "@/lib/casl";
import { useSession } from "@/lib/auth-client";

interface ApiQuestion { id: string; section: number; type: string; stem: RichDoc; options: { id: string; content: RichDoc }[] }

/** GET /api/v1/attempts/:id/questions (no correct answers) mapped to engine questions. */
async function loadQuestions(attemptId: string): Promise<ExamQuestion[]> {
  const r = await fetch(`/api/v1/attempts/${attemptId}/questions`, { credentials: "include" });
  if (!r.ok) throw Object.assign(new Error(String(r.status)), { status: r.status });
  const qs: ApiQuestion[] = await r.json();
  return qs.map((q) => ({
    id: q.id,
    section: q.section,
    type: q.type === "mcq_multi" ? "multi" : q.type === "numeric" ? "numeric" : "mcq",
    text: richDocToText(q.stem),
    doc: q.stem,
    options: q.options.map((o) => ({ id: o.id, text: richDocToText(o.content), doc: o.content })),
  }));
}

/** Full-screen, no sidebar. The route param is used as the test id: starting an attempt is idempotent and resumes. */
export function ExamClient({ testId }: { testId: string }) {
  const { data } = useSession();
  return (
    <AbilityProvider role="student">
      <Can I="attempt" a="Test" passThrough>
        {(allowed: boolean) =>
          allowed ? (
            <ExamScreen testId={testId} candidate={data?.user?.name ?? "Candidate"} loadQuestions={loadQuestions} />
          ) : (
            <p className="p-6 text-sm">You cannot attempt this test.</p>
          )
        }
      </Can>
    </AbilityProvider>
  );
}

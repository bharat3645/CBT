"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { QuestionEditor, QuestionList, payloadToDraft, questionApi } from "@/features/question-bank";
import { Can } from "@/lib/casl";

type Base = "/teacher" | "/admin";

export function QuestionBankPage({ base }: { base: Base }) {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Question bank</h1>
        <Can I="create" a="Question">
          <Link href={`${base}/questions/new`} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">New question</Link>
        </Can>
      </div>
      <QuestionList onOpen={(q) => router.push(`${base}/questions/${q.id}`)} />
    </div>
  );
}

export function NewQuestionPage({ base }: { base: Base }) {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">New question</h1>
      <Can I="create" a="Question" passThrough>
        {(allowed: boolean) =>
          allowed ? (
            <QuestionEditor onSave={async (payload) => { await questionApi.create(payload); router.push(`${base}/question-bank`); }} />
          ) : (
            <p className="text-sm text-muted-foreground">You do not have permission to create questions.</p>
          )
        }
      </Can>
    </div>
  );
}

export function EditQuestionPage({ base, questionId }: { base: Base; questionId: string }) {
  const router = useRouter();
  const { data, isLoading, error } = useQuery({ queryKey: ["question", questionId], queryFn: () => questionApi.get(questionId) });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (error || !data) return <p className="text-sm" role="alert">Could not load this question.</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Edit question (v{data.version})</h1>
      <QuestionEditor
        questionId={questionId}
        initial={payloadToDraft(data.payload)}
        onSave={async (payload) => { await questionApi.update(questionId, payload); router.push(`${base}/question-bank`); }}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { Upload, Plus } from "lucide-react";
import type {
  AdminDashboardData, DashboardOwnResult, ParentDashboardData, StudentDashboardData, TeacherDashboardData,
} from "@cbt/contracts/dashboard";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@cbt/ui";
import { Bar, ListCard, PageHeader, StatGrid, Status } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Loading, fmtDateTime, fmtPct } from "@/components/ui-kit";
import { useSelectedChild } from "@/features/parent/child";
import { AttendanceSummaryView } from "@/features/attendance/attendance-pages";
import { PerformanceCard } from "@/features/results/performance-card";
import { useMyAnalytics, useStudentAnalytics } from "@/features/results/api";
import { useDashboard } from "./api";

const firstName = (full: string) => full.trim().split(/\s+/)[0] || full;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function useRoleDashboard<T extends { role: string }>(role: T["role"], childId?: string | null) {
  const q = useDashboard({ childId });
  const wrongRole = q.data && q.data.role !== role;
  return { q, data: !wrongRole ? (q.data as unknown as T | undefined) : undefined, wrongRole };
}

function State({ q, wrongRole }: { q: { isLoading: boolean; error: unknown }; wrongRole?: boolean }) {
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  if (wrongRole) return <ErrorNote error={new Error("This dashboard is for a different role. Use the sidebar to open yours.")} />;
  return null;
}

const weekday = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "long" });

/** Paper status -> the exam-palette pill used across the app. */
function paperPill(p: { status: string; openFlagCount: number; missingKeyCount: number }) {
  if (p.status === "failed") return <Status s="not-answered" label="Failed" />;
  if (p.openFlagCount > 0) return <Status s="flagged" label={plural(p.openFlagCount, "flag")} />;
  if (p.status !== "review") return <Status s="not-visited" label={p.status === "parsing" ? "Converting" : "Uploaded"} />;
  if (p.missingKeyCount > 0) return <Status s="not-answered" label="No key" />;
  return <Status s="review" label="Ready" />;
}

function relativeDay(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

// ------------------------------------------------------------------------------------------------ admin
export function AdminDashboard() {
  const { q, data, wrongRole } = useRoleDashboard<AdminDashboardData>("institute_admin");
  const placeholder = <State q={q} wrongRole={wrongRole} />;
  if (!data) {
    return (
      <>
        <PageHeader title="Overview" />
        {placeholder}
      </>
    );
  }
  const s = data.stats;
  return (
    <>
      <PageHeader
        hero
        title={`Welcome back, ${firstName(data.user.name)}`}
        subtitle={`Here is what is happening at ${data.institute?.name ?? "your institute"} today.`}
        actions={
          <Button asChild>
            <Link href="/admin/students">
              <Plus /> Add students
            </Link>
          </Button>
        }
      />
      <StatGrid
        stats={[
          { label: "Active students", value: String(s.activeStudents), hint: `${plural(s.teachers, "teacher")}, ${plural(s.batches, "active batch", "active batches")}` },
          { label: "Tests this week", value: String(s.testsThisWeek), hint: s.liveNow ? `${s.liveNow} live now` : "None live right now" },
          { label: "Papers awaiting approval", value: String(s.papersAwaitingApproval), hint: s.papersWithFlags ? `${s.papersWithFlags} with open flags` : "No open flags" },
          { label: "Average score", value: fmtPct(s.avgScorePct), hint: s.evaluatedAttempts ? `${plural(s.evaluatedAttempts, "evaluated attempt")}` : "No results yet" },
        ]}
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {data.upcomingTests.length ? (
          <ListCard
            title="Upcoming and live tests"
            action={{ label: "All tests", href: "/admin/tests" }}
            columns={["Test", "Batch", "When"]}
            rows={data.upcomingTests.map((t) => ({
              cells: [t.title, t.batchNames.join(", ") || "Whole institute", fmtDateTime(t.windowStart)],
            }))}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Upcoming and live tests</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState>No published tests are scheduled.</EmptyState>
            </CardContent>
          </Card>
        )}
        {data.needsAttention.length ? (
          <ListCard
            title="Needs attention"
            action={{ label: "Review flags", href: "/admin/flags" }}
            columns={["Paper", "Status"]}
            rows={data.needsAttention.map((p) => ({
              cells: [<Link key={p.id} href={`/admin/papers/${p.id}`} className="hover:underline">{p.title}</Link>, paperPill(p)],
            }))}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState>Nothing is waiting for review.</EmptyState>
            </CardContent>
          </Card>
        )}
      </div>
      {data.recentResults.length > 0 && (
        <div className="mt-8">
          <ListCard
            title="Recent results"
            action={{ label: "All results", href: "/admin/results" }}
            columns={["Test", "Students", "Average", "Evaluated"]}
            rows={data.recentResults.map((r) => ({
              cells: [<Link key={r.testId} href={`/admin/tests/${r.testId}/leaderboard`} className="hover:underline">{r.title}</Link>, r.participants, fmtPct(r.avgPct), fmtDateTime(r.at)],
            }))}
          />
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ teacher
export function TeacherDashboard() {
  const { q, data, wrongRole } = useRoleDashboard<TeacherDashboardData>("teacher");
  if (!data) {
    return (
      <>
        <PageHeader title="Today" />
        <State q={q} wrongRole={wrongRole} />
      </>
    );
  }
  const s = data.stats;
  return (
    <>
      <PageHeader
        hero
        title={`${greeting()}, ${firstName(data.user.name)}`}
        subtitle={`${weekday(data.generatedAt)}: ${plural(s.batches, "batch", "batches")}, ${s.papersToReview} ${s.papersToReview === 1 ? "paper needs" : "papers need"} review.`}
        actions={
          <Button asChild>
            <Link href="/teacher/papers/upload">
              <Upload /> Upload paper
            </Link>
          </Button>
        }
      />
      <StatGrid
        stats={[
          { label: "My batches", value: String(s.batches), hint: `${plural(s.students, "student")}` },
          { label: "Needs review", value: String(s.papersToReview), hint: s.oldestPaperDays == null ? "Nothing waiting" : `Oldest: ${s.oldestPaperDays === 0 ? "today" : plural(s.oldestPaperDays, "day")}` },
          { label: "Tests this week", value: String(s.testsThisWeek), hint: s.liveNow ? `${s.liveNow} live now` : undefined },
          { label: "Live now", value: String(s.liveNow), hint: "Tests open for students" },
        ]}
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {data.papersNeedingReview.length ? (
          <ListCard
            title="Papers needing review"
            action={{ label: "Open", href: "/teacher/papers/needs-review" }}
            columns={["Paper", "Status", "Uploaded"]}
            rows={data.papersNeedingReview.map((p) => ({
              cells: [<Link key={p.id} href={`/teacher/papers/${p.id}`} className="hover:underline">{p.title}</Link>, paperPill(p), relativeDay(p.createdAt)],
            }))}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Papers needing review</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState>No papers are waiting.</EmptyState>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Batch performance (latest result per batch)</CardTitle>
            <Link href="/teacher/insights#student-gaps" className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/70">
              Per-student gaps
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.batchPerformance.length === 0 ? (
              <EmptyState>You are not assigned to a batch yet.</EmptyState>
            ) : (
              data.batchPerformance.map((b) =>
                b.avgPct == null ? (
                  <div key={b.batchId} className="flex justify-between text-xs">
                    <span>{b.name}</span>
                    <span className="text-muted-foreground">No results yet</span>
                  </div>
                ) : (
                  <Bar key={b.batchId} label={`${b.name}${b.testTitle ? `, ${b.testTitle}` : ""}`} value={Math.round(b.avgPct)} />
                ),
              )
            )}
          </CardContent>
        </Card>
      </div>
      {data.upcomingTests.length > 0 && (
        <div className="mt-8">
          <ListCard
            title="Upcoming and live tests"
            action={{ label: "Tests", href: "/teacher/tests" }}
            columns={["Test", "Batch", "When"]}
            rows={data.upcomingTests.map((t) => ({ cells: [t.title, t.batchNames.join(", ") || "Whole institute", fmtDateTime(t.windowStart)] }))}
          />
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ student
function ResultsCard({ results, hrefFor, action }: { results: DashboardOwnResult[]; hrefFor: (r: DashboardOwnResult) => string | null; action?: { label: string; href: string } }) {
  if (!results.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent results</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState>No released results yet.</EmptyState>
        </CardContent>
      </Card>
    );
  }
  return (
    <ListCard
      title="Recent results"
      action={action}
      columns={["Test", "Score", "Rank"]}
      rows={results.map((r) => {
        const href = hrefFor(r);
        return {
          cells: [
            href ? <Link key={r.attemptId} href={href} className="hover:underline">{r.title}</Link> : r.title,
            `${r.score} / ${r.maxScore}`,
            r.rank != null ? `#${r.rank}${r.participants ? ` of ${r.participants}` : ""}` : "-",
          ],
        };
      })}
    />
  );
}

export function StudentDashboard() {
  const { q, data, wrongRole } = useRoleDashboard<StudentDashboardData>("student");
  const analytics = useMyAnalytics(!!data);
  if (!data) {
    return (
      <>
        <PageHeader title="Home" />
        <State q={q} wrongRole={wrongRole} />
      </>
    );
  }
  const s = data.stats;
  const next = data.upcomingTests[0];
  return (
    <>
      <PageHeader
        hero
        title={`Hi ${firstName(data.user.name)}`}
        subtitle={next ? `Your next test: ${next.title}, ${fmtDateTime(next.windowStart)}.` : "No tests are scheduled right now."}
        actions={
          <Button asChild>
            <Link href="/student/tests/upcoming">Next test</Link>
          </Button>
        }
      />
      <StatGrid
        stats={[
          { label: "Tests attempted", value: String(s.testsAttempted), hint: `${s.resultsReleased} with released results` },
          { label: "Average score", value: fmtPct(s.avgScorePct), hint: s.bestScorePct != null ? `Best: ${s.bestScorePct}%` : "After your first result" },
          { label: "Class rank", value: s.classRank ? `#${s.classRank.rank}` : "-", hint: s.classRank ? `of ${s.classRank.participants}, ${s.classRank.testTitle}` : "Shown once ranks are computed" },
          { label: "Upcoming tests", value: String(data.badges.upcomingTests), hint: next ? `Next: ${fmtDateTime(next.windowStart)}` : undefined },
        ]}
      />
      <div className="mt-8">
        <PerformanceCard analytics={analytics.data} isLoading={analytics.isLoading} moreHref="/student/weak-topics" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {data.upcomingTests.length ? (
          <ListCard
            title="Upcoming"
            action={{ label: "All", href: "/student/tests/upcoming" }}
            columns={["Test", "When", "Duration"]}
            rows={data.upcomingTests.map((t) => ({ cells: [t.title, fmtDateTime(t.windowStart), `${t.durationMinutes} min`] }))}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Upcoming</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState>Nothing scheduled for your batches.</EmptyState>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Weak topics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.weakTopics.length === 0 ? (
              <EmptyState>Topic accuracy appears after your first released result.</EmptyState>
            ) : (
              data.weakTopics.map((t) => <Bar key={t.topicId} label={t.topicName} value={t.accuracy} color={t.accuracy < 40 ? "bg-exam-not-answered" : "bg-exam-flagged"} />)
            )}
          </CardContent>
        </Card>
      </div>
      <div className="mt-8">
        <ResultsCard results={data.recentResults} hrefFor={(r) => `/student/tests/results/${r.attemptId}`} action={{ label: "All results", href: "/student/tests/results" }} />
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ parent
export function ParentDashboard() {
  const { child, isLoading: childLoading } = useSelectedChild();
  const { q, data, wrongRole } = useRoleDashboard<ParentDashboardData>("parent", child?.studentId ?? null);
  const analytics = useStudentAnalytics(data?.child?.userId);
  if (childLoading || !data) {
    return (
      <>
        <PageHeader title="Overview" />
        <State q={childLoading ? { isLoading: true, error: null } : q} wrongRole={wrongRole} />
      </>
    );
  }
  if (!data.child) {
    return (
      <>
        <PageHeader title={`Welcome, ${firstName(data.user.name)}`} />
        <EmptyState>No child is linked to your account yet. Ask your institute to link your account to your child.</EmptyState>
      </>
    );
  }
  const s = data.stats;
  return (
    <>
      <PageHeader hero title={`${firstName(data.child.name)}'s progress`} subtitle={`Updated after every released result. ${data.child.batches.map((b) => b.name).join(", ")}`} />
      <StatGrid
        stats={[
          { label: "Latest score", value: s.latest ? `${s.latest.score} / ${s.latest.maxScore}` : "-", hint: s.latest ? (s.latest.score < 0 ? `${s.latest.title}. Below zero after negative marking` : s.latest.title) : "No released result yet" },
          { label: "Average score", value: fmtPct(s.avgScorePct), hint: `${plural(s.testsAttempted, "test")} attempted` },
          { label: "Syllabus covered", value: s.syllabusPercent == null ? "-" : `${s.syllabusPercent}%`, hint: s.syllabusPercent == null ? "No syllabus set up" : "Across the child's batches" },
          { label: "Attendance", value: "See below", hint: "Recorded by teachers" },
        ]}
      />
      <div className="mt-8">
        <PerformanceCard
          analytics={analytics.data}
          isLoading={analytics.isLoading}
          title={`${firstName(data.child.name)}'s performance`}
          youLabel={`${firstName(data.child.name)}'s score`}
          moreHref="/parent/results"
        />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <ResultsCard results={data.recentResults} hrefFor={() => `/parent/results`} action={{ label: "All results", href: "/parent/results" }} />
        <Card>
          <CardHeader>
            <CardTitle>Syllabus progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.syllabusBySubject.length === 0 ? (
              <EmptyState>The institute has not set up a syllabus for this batch yet.</EmptyState>
            ) : (
              data.syllabusBySubject.map((sub) => <Bar key={sub.id} label={sub.name} value={sub.percent} />)
            )}
          </CardContent>
        </Card>
      </div>
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-bold">Attendance</h2>
        <AttendanceSummaryView studentUserId={data.child.userId} />
      </div>
    </>
  );
}

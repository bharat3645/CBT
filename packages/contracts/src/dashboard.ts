/**
 * Shapes of GET /api/v1/dashboard and GET /api/v1/children (types only; the API builds them from real tables).
 * Every number is computed from the caller's own tenant data; nothing here is a placeholder.
 */

/** Sidebar badge counts, keyed by meaning (the web nav maps keys to menu items). Missing / 0 = no badge. */
export interface DashboardBadges {
  /** papers that are not yet approved or rejected (upload, parsing, review, failed) */
  papersToReview: number;
  /** papers with open error flags or a failed conversion */
  flags: number;
  /** published tests (for the student's batches) whose window has not closed and are not yet submitted */
  upcomingTests: number;
  /** unread in-app notifications */
  unreadNotifications: number;
}

export interface DashboardTest {
  id: string;
  title: string;
  windowStart: string;
  windowEnd: string;
  durationMinutes: number;
  batchNames: string[];
}

export interface DashboardPaper {
  id: string;
  title: string;
  status: string;
  questionCount: number;
  openFlagCount: number;
  missingKeyCount: number;
  createdAt: string;
}

export interface DashboardTestResult {
  testId: string;
  title: string;
  participants: number;
  avgPct: number;
  at: string;
}

export interface DashboardOwnResult {
  attemptId: string;
  testId: string;
  title: string;
  score: number;
  maxScore: number;
  pct: number;
  at: string;
  /** batch rank if ranks have been computed for this test */
  rank: number | null;
  participants: number | null;
}

export interface DashboardBatchPerf {
  batchId: string;
  name: string;
  testTitle: string | null;
  avgPct: number | null;
  participants: number;
}

export interface ChildSummary {
  /** student profile id (what links and scoping use) */
  studentId: string;
  /** the child's user id (what results/analytics are keyed by) */
  userId: string;
  name: string;
  rollNo: string | null;
  batches: { id: string; name: string }[];
}

interface DashboardBase {
  user: { id: string; name: string; email: string };
  institute: { id: string; name: string; logo: string | null; brandColor: string | null } | null;
  badges: DashboardBadges;
  generatedAt: string;
}

export interface AdminDashboardData extends DashboardBase {
  role: "institute_admin";
  stats: {
    activeStudents: number;
    teachers: number;
    parents: number;
    batches: number;
    testsThisWeek: number;
    liveNow: number;
    papersAwaitingApproval: number;
    papersWithFlags: number;
    /** average of every released, current evaluation (percent), null when nothing is released yet */
    avgScorePct: number | null;
    /** current evaluations (released or not) behind avgScorePct */
    evaluatedAttempts: number;
  };
  upcomingTests: DashboardTest[];
  needsAttention: DashboardPaper[];
  recentResults: DashboardTestResult[];
}

export interface TeacherDashboardData extends DashboardBase {
  role: "teacher";
  stats: {
    batches: number;
    students: number;
    papersToReview: number;
    /** age in whole days of the oldest paper still waiting */
    oldestPaperDays: number | null;
    testsThisWeek: number;
    liveNow: number;
  };
  papersNeedingReview: DashboardPaper[];
  batchPerformance: DashboardBatchPerf[];
  upcomingTests: DashboardTest[];
}

export interface StudentDashboardData extends DashboardBase {
  role: "student";
  stats: {
    testsAttempted: number;
    resultsReleased: number;
    avgScorePct: number | null;
    bestScorePct: number | null;
    classRank: { rank: number; participants: number; testTitle: string } | null;
  };
  upcomingTests: DashboardTest[];
  weakTopics: { topicId: string; topicName: string; accuracy: number }[];
  recentResults: DashboardOwnResult[];
}

export interface ParentDashboardData extends DashboardBase {
  role: "parent";
  children: ChildSummary[];
  child: ChildSummary | null;
  stats: {
    testsAttempted: number;
    avgScorePct: number | null;
    latest: { title: string; score: number; maxScore: number; pct: number } | null;
    syllabusPercent: number | null;
  };
  recentResults: DashboardOwnResult[];
  syllabusBySubject: { id: string; name: string; percent: number }[];
}

export interface SuperAdminDashboardData extends DashboardBase {
  role: "super_admin";
}

export type DashboardData =
  | AdminDashboardData
  | TeacherDashboardData
  | StudentDashboardData
  | ParentDashboardData
  | SuperAdminDashboardData;

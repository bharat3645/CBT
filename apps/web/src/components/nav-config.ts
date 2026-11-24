import {
  LayoutDashboard, GraduationCap, BookOpen, Library, FileText, ClipboardList, BarChart3, Flag, Users, UserRound, Baby,
  LineChart, Settings, Upload, CalendarCheck, Sun, Layers, Target, Home, Dumbbell, ListChecks, MessageSquare, Plus, PlayCircle, UserPlus,
} from "lucide-react";
import type { NavGroup, NavItem } from "@cbt/ui";
import type { DashboardBadges } from "@cbt/contracts/dashboard";
import type { LucideIcon } from "lucide-react";
import type { Role } from "@/lib/casl";

export type RoleSlug = "admin" | "teacher" | "student" | "parent";

export const roleSlugToRole: Record<RoleSlug, Role> = {
  admin: "institute_admin",
  teacher: "teacher",
  student: "student",
  parent: "parent",
};

export type RoleNav = {
  label: string;
  groups: NavGroup[];
  primaryAction?: { label: string; href: string; icon?: LucideIcon };
};

/**
 * Menu structure only. Badge counts are NOT stored here: `withBadges` fills them from GET /api/v1/dashboard (see BADGE_BY_HREF).
 */
export const navByRole: Record<RoleSlug, RoleNav> = {
  admin: {
    label: "Institute admin",
    primaryAction: { label: "Add students", href: "/admin/students", icon: UserPlus },
    groups: [
      { items: [{ title: "Overview", href: "/admin", icon: LayoutDashboard }] },
      {
        label: "Academics",
        items: [
          { title: "Batches", href: "/admin/batches", icon: Layers },
          { title: "Syllabus", href: "/admin/syllabus", icon: BookOpen },
          { title: "Question bank", href: "/admin/question-bank", icon: Library },
        ],
      },
      {
        label: "Tests",
        items: [
          { title: "Papers", href: "/admin/papers", icon: FileText },
          { title: "Tests", href: "/admin/tests", icon: ClipboardList },
          { title: "Results", href: "/admin/results", icon: BarChart3 },
          { title: "Flags", href: "/admin/flags", icon: Flag },
        ],
      },
      {
        label: "People",
        items: [
          { title: "Teachers", href: "/admin/teachers", icon: GraduationCap },
          { title: "Students", href: "/admin/students", icon: Users },
          { title: "Parents", href: "/admin/parents", icon: Baby },
        ],
      },
      { items: [{ title: "Reports", href: "/admin/reports", icon: LineChart }, { title: "Settings", href: "/admin/settings", icon: Settings }] },
    ],
  },
  teacher: {
    label: "Teacher",
    primaryAction: { label: "Upload paper", href: "/teacher/papers/upload", icon: Upload },
    groups: [
      {
        items: [
          { title: "Today", href: "/teacher", icon: Sun },
          { title: "My batches", href: "/teacher/batches", icon: Layers },
        ],
      },
      {
        label: "Content",
        items: [
          {
            title: "Papers",
            icon: FileText,
            children: [
              { title: "Upload", href: "/teacher/papers/upload" },
              { title: "Needs review", href: "/teacher/papers/needs-review" },
              { title: "Approved", href: "/teacher/papers/approved" },
            ],
          },
          { title: "Tests", href: "/teacher/tests", icon: ClipboardList },
          { title: "Question bank", href: "/teacher/question-bank", icon: Library },
          { title: "Syllabus", href: "/teacher/syllabus", icon: BookOpen },
        ],
      },
      {
        label: "Class",
        items: [
          { title: "Attendance", href: "/teacher/attendance", icon: CalendarCheck },
          { title: "Insights", href: "/teacher/insights", icon: LineChart },
        ],
      },
    ],
  },
  student: {
    label: "Student",
    primaryAction: { label: "Next test", href: "/student/tests/upcoming", icon: PlayCircle },
    groups: [
      { items: [{ title: "Home", href: "/student", icon: Home }] },
      {
        label: "Learn",
        items: [
          {
            title: "Tests",
            icon: ClipboardList,
            children: [
              { title: "Upcoming", href: "/student/tests/upcoming" },
              { title: "Results", href: "/student/tests/results" },
            ],
          },
          { title: "Practice", href: "/student/practice", icon: Dumbbell },
          { title: "Syllabus", href: "/student/syllabus", icon: BookOpen },
          { title: "Weak topics", href: "/student/weak-topics", icon: Target },
        ],
      },
    ],
  },
  parent: {
    label: "Parent",
    groups: [
      {
        items: [
          { title: "Overview", href: "/parent", icon: LayoutDashboard },
          { title: "Results", href: "/parent/results", icon: BarChart3 },
          { title: "Attendance", href: "/parent/attendance", icon: CalendarCheck },
          { title: "Syllabus", href: "/parent/syllabus", icon: ListChecks },
          { title: "Feedback", href: "/parent/feedback", icon: MessageSquare },
        ],
      },
    ],
  },
};

/** Which live count each menu item shows (by href). Unlisted items never get a badge. */
export const BADGE_BY_HREF: Record<string, keyof DashboardBadges> = {
  "/admin/papers": "papersToReview",
  "/admin/flags": "flags",
  "/teacher/papers/needs-review": "papersToReview",
  "/student/tests/upcoming": "upcomingTests",
  "/parent/feedback": "unreadNotifications",
};

/** Copy of `groups` with live badge counts applied (zero or unknown counts render no badge). */
export function withBadges(groups: NavGroup[], badges: Partial<DashboardBadges> | undefined): NavGroup[] {
  const apply = (item: NavItem): NavItem => {
    const key = item.href ? BADGE_BY_HREF[item.href] : undefined;
    const n = key ? badges?.[key] : undefined;
    const { badge: _drop, ...rest } = item;
    return {
      ...rest,
      ...(n ? { badge: n > 99 ? "99+" : n } : {}),
      ...(item.children ? { children: item.children.map(apply) } : {}),
    };
  };
  return groups.map((g) => ({ ...g, items: g.items.map(apply) }));
}

// referenced so unused-icon lint stays quiet if a role drops one
export const _icons = { Plus, UserRound };

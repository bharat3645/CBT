/** The demo accounts, shared by the mock API and the login screen's quick-fill buttons. */
export type DemoRole = "admin" | "teacher" | "student" | "parent" | "super_admin";

export const DEMO_PASSWORD = "Passw0rd!Passw0rd";

export const DEMO_USERS: { email: string; role: DemoRole; name: string; blurb: string }[] = [
  { email: "admin@demo.test", role: "admin", name: "Demo Admin", blurb: "Runs the institute: batches, people, papers, results, reports" },
  { email: "teacher@demo.test", role: "teacher", name: "Demo Teacher", blurb: "Uploads papers, builds tests, marks attendance, writes feedback" },
  { email: "student@demo.test", role: "student", name: "Demo Student", blurb: "Takes the live exam, sees rank and weak topics, practises" },
  { email: "parent@demo.test", role: "parent", name: "Demo Parent", blurb: "Follows a child's results, attendance and teacher feedback" },
  { email: "owner@cbt.local", role: "super_admin", name: "Platform Owner", blurb: "Approves new institutes (password ChangeMe!12345 on a real install)" },
];

export const roleHome: Record<DemoRole, string> = { admin: "/admin", teacher: "/teacher", student: "/student", parent: "/parent", super_admin: "/superadmin" };

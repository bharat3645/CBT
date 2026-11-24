// M1 (audit) + M2 (people & batches). All tables here are tenant tables (institute_id => RLS).
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, date } from "drizzle-orm/pg-core";
import { memberships, users } from "./_base";
import { tenantTable } from "./_helpers";

export * from "./_base";
export * from "./_helpers";

/** Insert-only (enforced by DB trigger + revoked privileges). Rows are written by triggers / app_audit_event(). */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  instituteId: uuid("institute_id"),
  actorId: uuid("actor_id"),
  actorRole: text("actor_role"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_log_inst_created_idx").on(t.instituteId, t.createdAt),
  index("audit_log_entity_idx").on(t.entity, t.entityId),
]);

export const students = tenantTable("students", {
  membershipId: uuid("membership_id").notNull().unique().references(() => memberships.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rollNo: text("roll_no"),
  dob: date("dob"),
}, (t) => [uniqueIndex("students_inst_roll_uq").on(t.instituteId, t.rollNo)]);

export const teachers = tenantTable("teachers", {
  membershipId: uuid("membership_id").notNull().unique().references(() => memberships.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  employeeCode: text("employee_code"),
  qualification: text("qualification"),
});

export const guardians = tenantTable("guardians", {
  membershipId: uuid("membership_id").notNull().unique().references(() => memberships.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  relation: text("relation"),
});

export const guardianStudentLinks = tenantTable("guardian_student_links", {
  guardianId: uuid("guardian_id").notNull().references(() => guardians.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "verified", "revoked"] }).notNull().default("pending"),
  verifiedBy: uuid("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
}, (t) => [uniqueIndex("guardian_student_uq").on(t.guardianId, t.studentId)]);

export const batches = tenantTable("batches", {
  /** Platform exam category (owned by the syllabus/exams module). No FK on purpose. */
  examId: uuid("exam_id"),
  name: text("name").notNull(),
  code: text("code"),
  year: integer("year"),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
}, (t) => [uniqueIndex("batches_inst_name_year_uq").on(t.instituteId, t.name, t.year)]);

export const enrolments = tenantTable("enrolments", {
  batchId: uuid("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
}, (t) => [uniqueIndex("enrolments_batch_student_uq").on(t.batchId, t.studentId), index("enrolments_student_idx").on(t.studentId)]);

export const batchTeachers = tenantTable("batch_teachers", {
  batchId: uuid("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
  teacherId: uuid("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  subject: text("subject"),
}, (t) => [uniqueIndex("batch_teachers_uq").on(t.batchId, t.teacherId), index("batch_teachers_teacher_idx").on(t.teacherId)]);

export interface ImportRowError { row: number; field?: string; message: string }

export const importJobs = tenantTable("import_jobs", {
  kind: text("kind").notNull().default("users"),
  status: text("status", { enum: ["queued", "processing", "done", "failed"] }).notNull().default("queued"),
  filename: text("filename"),
  totalRows: integer("total_rows").notNull().default(0),
  succeededRows: integer("succeeded_rows").notNull().default(0),
  failedRows: integer("failed_rows").notNull().default(0),
  errors: jsonb("errors").$type<ImportRowError[]>().notNull().default([]),
  /** Original CSV text, kept so the error report can echo failed rows. */
  csv: text("csv"),
  createdBy: uuid("created_by"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

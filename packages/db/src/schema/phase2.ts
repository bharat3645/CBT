import { date, boolean, text, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantTable } from "./_helpers";

/** Phase 2: attendance, teacher feedback, practice history. RLS comes automatically from institute_id. */
export const attendanceRecords = tenantTable("attendance_records", {
  batchId: uuid("batch_id").notNull(),
  studentUserId: uuid("student_user_id").notNull(),
  onDate: date("on_date").notNull(),
  status: text("status", { enum: ["present", "absent", "late", "excused"] }).notNull(),
  markedBy: uuid("marked_by").notNull(),
}, (t) => [uniqueIndex("attendance_uq").on(t.batchId, t.studentUserId, t.onDate)]);

export const teacherFeedback = tenantTable("teacher_feedback", {
  studentUserId: uuid("student_user_id").notNull(),
  authorId: uuid("author_id").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
});

export const practiceAttempts = tenantTable("practice_attempts", {
  studentUserId: uuid("student_user_id").notNull(),
  questionId: uuid("question_id").notNull(),
  correct: boolean("correct").notNull(),
});

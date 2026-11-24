import { z } from "zod";

export const PERSON_ROLES = ["institute_admin", "teacher", "student", "parent"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");
const phone = z.string().regex(/^\+?[0-9]{10,15}$/, "Phone must be 10-15 digits");

export const createPersonInput = z.object({
  role: z.enum(PERSON_ROLES),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email(),
  phone: phone.optional(),
  rollNo: z.string().trim().min(1).max(50).optional(),
  dob: isoDate.optional(),
  employeeCode: z.string().trim().max(50).optional(),
  qualification: z.string().trim().max(200).optional(),
  relation: z.string().trim().max(50).optional(),
  batchIds: z.array(z.string().uuid()).max(50).default([]),
  /** parent only: student ids to link (created as verified, since an admin does it) */
  childStudentIds: z.array(z.string().uuid()).max(10).default([]),
});
export type CreatePersonInput = z.infer<typeof createPersonInput>;

export const updatePersonInput = z.object({
  rollNo: z.string().trim().min(1).max(50).nullable().optional(),
  dob: isoDate.nullable().optional(),
  employeeCode: z.string().trim().max(50).nullable().optional(),
  qualification: z.string().trim().max(200).nullable().optional(),
  relation: z.string().trim().max(50).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const listPeopleQuery = z.object({
  role: z.enum(PERSON_ROLES).optional(),
  q: z.string().trim().max(100).optional(),
  batchId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const linkQuery = z.object({ guardianId: z.string().uuid().optional(), studentId: z.string().uuid().optional() });

export const batchInput = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(50).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  examId: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

/** One CSV row after header normalisation. Everything arrives as strings. */
export const importRowSchema = z.object({
  role: z.enum(["teacher", "student", "parent"]).default("student"),
  name: z.string().trim().min(1, "name is required").max(200),
  email: z.string().trim().toLowerCase().email("invalid email"),
  phone: phone.optional(),
  roll_no: z.string().trim().min(1).max(50).optional(),
  dob: isoDate.optional(),
  employee_code: z.string().trim().max(50).optional(),
  relation: z.string().trim().max(50).optional(),
  /** batch names separated by | (must already exist) */
  batches: z.string().optional(),
  /** parent only: children roll numbers separated by | */
  children: z.string().optional(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

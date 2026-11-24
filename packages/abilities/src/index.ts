import { AbilityBuilder, createMongoAbility, subject as caslSubject } from "@casl/ability";
import type { MongoAbility, RawRuleOf, Subject } from "@casl/ability";

/** Role matrix from SRS section 4. Shared by the API (guards/services) and the web app (UI gating). */
export const ROLES = ["super_admin", "institute_admin", "teacher", "student", "parent"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "manage", "create", "read", "update", "delete",
  "approve", "suspend", "schedule", "export", "review", "take", "import",
] as const;
export type Action = (typeof ACTIONS)[number];

export const SUBJECTS = [
  "Institute", "ExamCategory", "AuditLog", "User", "Batch", "Syllabus", "Material", "Paper", "Question",
  "Test", "AnswerKey", "Attempt", "Result", "Attendance", "Analytics", "Incident", "GuardianLink", "Import", "Report",
] as const;
export type SubjectName = (typeof SUBJECTS)[number];

/**
 * Subjects carry the fields conditions are evaluated against:
 *   instituteId (every tenant object), batchId (batch-scoped objects: material, paper, test, attendance, analytics...),
 *   studentId (results/attendance/reports), ownerId (e.g. paper author), released (answer keys after release).
 */
export interface Actor {
  userId: string;
  role: Role;
  /** null for super_admin (platform scope). */
  instituteId: string | null;
  /** teacher: batches they teach. student: batches they are enrolled in. */
  batchIds?: string[];
  /** student: own student id. */
  studentId?: string;
  /** parent: verified linked student ids. */
  childStudentIds?: string[];
}

export type AppAbility = MongoAbility<[Action, Subject]>;
export type AppRule = RawRuleOf<AppAbility>;

export function defineAbilityFor(actor: Actor): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  const inst = { instituteId: actor.instituteId };
  const ownBatches = { instituteId: actor.instituteId, batchId: { $in: actor.batchIds ?? [] } };

  switch (actor.role) {
    case "super_admin":
      // Platform scope only: institutes, categories, audit. No tenant data.
      can(["read", "approve", "suspend", "update"], "Institute");
      can("manage", "ExamCategory");
      can("read", "AuditLog");
      break;

    case "institute_admin":
      can(["read", "update"], "Institute", { id: actor.instituteId });
      can("read", "AuditLog", inst);
      can("manage", ["User", "Batch", "GuardianLink", "Import"], inst);
      can("manage", ["Syllabus", "Material", "Paper", "Question", "Test", "Attendance"], inst);
      can(["read"], ["AnswerKey", "Result", "Analytics", "Attempt"], inst);
      can("export", ["Analytics", "Result", "Report"], inst);
      can("review", "Incident", inst);
      break;

    case "teacher":
      can("read", ["User", "Batch"], inst);
      can("read", "Syllabus", inst);
      can("read", "Question", inst);
      can(["create", "update"], "Question", inst);
      can(["create", "update", "read"], "Material", ownBatches);
      can(["create", "read", "update", "approve"], "Paper", ownBatches);
      can(["create", "read", "update", "schedule"], "Test", ownBatches);
      // answer keys: authors / assigned teachers only
      can("read", "AnswerKey", { instituteId: actor.instituteId, ownerId: actor.userId });
      can("read", "AnswerKey", ownBatches);
      can(["create", "read", "update"], "Attendance", ownBatches);
      can("read", ["Analytics", "Result", "Attempt"], ownBatches);
      can("export", ["Analytics", "Result", "Report"], ownBatches);
      can("review", "Incident", { instituteId: actor.instituteId, ownerId: actor.userId });
      break;

    case "student":
      can("read", ["Test", "Syllabus", "Material"], { instituteId: actor.instituteId, batchId: { $in: actor.batchIds ?? [] } });
      // own batches only (the API lists/gets just the batches the student is enrolled in)
      can("read", "Batch", { instituteId: actor.instituteId, id: { $in: actor.batchIds ?? [] } });
      can("take", "Test", { instituteId: actor.instituteId, batchId: { $in: actor.batchIds ?? [] } });
      can(["create", "read", "update"], "Attempt", { instituteId: actor.instituteId, studentId: actor.studentId });
      can("read", ["Result", "Analytics", "Attendance"], { instituteId: actor.instituteId, studentId: actor.studentId });
      can("read", "AnswerKey", { instituteId: actor.instituteId, released: true });
      can("export", "Report", { instituteId: actor.instituteId, studentId: actor.studentId });
      break;

    case "parent": {
      const kids = { instituteId: actor.instituteId, studentId: { $in: actor.childStudentIds ?? [] } };
      can("read", ["Result", "Attendance", "Analytics"], kids);
      // Syllabus progress of the child's batches (the API narrows to those batches); no write access.
      can("read", "Syllabus", inst);
      can("read", "AnswerKey", { ...kids, released: true });
      can("export", "Report", kids);
      break;
    }
  }

  // Everyone may read their own institute (branding, FR-006).
  if (actor.role !== "super_admin" && actor.role !== "institute_admin") can("read", "Institute", { id: actor.instituteId });

  // Hard rules regardless of role: tenant data is never cross-institute.
  if (actor.role !== "super_admin") cannot("manage", "Institute", { id: { $ne: actor.instituteId } });
  return build();
}

/** Tag a plain object with its subject type for instance checks: ability.can('approve', asSubject('Paper', row)). */
export function asSubject<T extends object>(type: SubjectName, obj: T) {
  return caslSubject(type, obj);
}

/** Serialise rules for the web client (`createAbility(rules)` on the other side). */
export function serializeRules(ability: AppAbility): AppRule[] {
  return ability.rules as AppRule[];
}
export function createAbility(rules: AppRule[]): AppAbility {
  return createMongoAbility<AppAbility>(rules);
}

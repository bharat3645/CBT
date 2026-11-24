import { describe, expect, it } from "vitest";
import { asSubject, defineAbilityFor, createAbility, serializeRules } from "./index";

const A = "inst-a";
const B = "inst-b";

describe("role matrix (SRS section 4)", () => {
  it("super admin: institutes + audit, no tenant data", () => {
    const a = defineAbilityFor({ userId: "u", role: "super_admin", instituteId: null });
    expect(a.can("approve", "Institute")).toBe(true);
    expect(a.can("suspend", "Institute")).toBe(true);
    expect(a.can("manage", "ExamCategory")).toBe(true);
    expect(a.can("read", "AuditLog")).toBe(true);
    expect(a.can("read", "User")).toBe(false);
    expect(a.can("take", "Test")).toBe(false);
  });

  it("institute admin is scoped to own institute", () => {
    const a = defineAbilityFor({ userId: "u", role: "institute_admin", instituteId: A });
    expect(a.can("create", "User")).toBe(true);
    expect(a.can("approve", asSubject("Paper", { instituteId: A, batchId: "b1" }))).toBe(true);
    expect(a.can("approve", asSubject("Paper", { instituteId: B, batchId: "b1" }))).toBe(false);
    expect(a.can("approve", "Institute")).toBe(false);
    expect(a.can("read", "AuditLog")).toBe(true);
    expect(a.can("read", asSubject("AuditLog", { instituteId: B }))).toBe(false);
  });

  it("teacher: own batches only", () => {
    const a = defineAbilityFor({ userId: "t1", role: "teacher", instituteId: A, batchIds: ["b1"] });
    expect(a.can("approve", asSubject("Paper", { instituteId: A, batchId: "b1" }))).toBe(true);
    expect(a.can("approve", asSubject("Paper", { instituteId: A, batchId: "b2" }))).toBe(false);
    expect(a.can("schedule", asSubject("Test", { instituteId: A, batchId: "b1" }))).toBe(true);
    expect(a.can("create", "User")).toBe(false);
    expect(a.can("read", asSubject("AnswerKey", { instituteId: A, batchId: "b2", ownerId: "t1" }))).toBe(true);
    expect(a.can("read", asSubject("AnswerKey", { instituteId: A, batchId: "b2", ownerId: "t9" }))).toBe(false);
    expect(a.can("read", "AuditLog")).toBe(false);
  });

  it("student: own results, keys only after release, cannot manage", () => {
    const a = defineAbilityFor({ userId: "u", role: "student", instituteId: A, studentId: "s1", batchIds: ["b1"] });
    expect(a.can("take", asSubject("Test", { instituteId: A, batchId: "b1" }))).toBe(true);
    expect(a.can("take", asSubject("Test", { instituteId: A, batchId: "b2" }))).toBe(false);
    expect(a.can("read", asSubject("Result", { instituteId: A, studentId: "s1" }))).toBe(true);
    expect(a.can("read", asSubject("Result", { instituteId: A, studentId: "s2" }))).toBe(false);
    expect(a.can("read", asSubject("AnswerKey", { instituteId: A, released: false }))).toBe(false);
    expect(a.can("read", asSubject("AnswerKey", { instituteId: A, released: true }))).toBe(true);
    expect(a.can("create", "Paper")).toBe(false);
  });

  it("parent: linked children only", () => {
    const a = defineAbilityFor({ userId: "p", role: "parent", instituteId: A, childStudentIds: ["s1"] });
    expect(a.can("read", asSubject("Result", { instituteId: A, studentId: "s1" }))).toBe(true);
    expect(a.can("read", asSubject("Attendance", { instituteId: A, studentId: "s2" }))).toBe(false);
    expect(a.can("take", "Test")).toBe(false);
    expect(a.can("export", asSubject("Report", { instituteId: A, studentId: "s1" }))).toBe(true);
  });

  it("rules serialise for the web client", () => {
    const a = defineAbilityFor({ userId: "u", role: "teacher", instituteId: A, batchIds: ["b1"] });
    const web = createAbility(JSON.parse(JSON.stringify(serializeRules(a))));
    expect(web.can("approve", asSubject("Paper", { instituteId: A, batchId: "b1" }))).toBe(true);
  });
});

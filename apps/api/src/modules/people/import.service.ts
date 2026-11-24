import { BadRequestException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import Papa from "papaparse";
import { batches, importJobs, students, type Db, type ImportRowError } from "@cbt/db";
import { DB } from "../../common/db/db.module";
import type { RequestCtx } from "../../common/request-context";
import { PeopleService, DuplicateError, toDuplicateError } from "./people.service";
import { importRowSchema, type ImportRow } from "./people.schemas";

export const MAX_IMPORT_ROWS = 5000;
const TEMPLATE_HEADER = "role,name,email,phone,roll_no,dob,employee_code,relation,batches,children";

/**
 * FR-003 bulk import. Every row is validated and applied independently (its own savepoint), so one bad row never
 * blocks the other 999. The job row keeps a per-row error list and the original CSV for the downloadable error report.
 *
 * Runs inside the request's tenant transaction. 1,000 rows take a few seconds; for very large files move process()
 * to the worker (it only needs the job id + institute id and `DB`).
 */
@Injectable()
export class ImportService {
  constructor(@Inject(DB) private readonly db: Db, private readonly people: PeopleService) {}

  template() {
    return `${TEMPLATE_HEADER}\nstudent,Asha Rao,asha@example.com,9876543210,R001,2008-04-12,,,JEE-2026-A,\nteacher,Ravi Kumar,ravi@example.com,,,,T-17,,JEE-2026-A|NEET-2026,\nparent,Meena Rao,meena@example.com,,,,,Mother,,R001`;
  }

  async start(ctx: RequestCtx, csv: string, filename?: string) {
    if (!csv.trim()) throw new BadRequestException("Empty file");
    const parsed = this.parse(csv);
    if (parsed.rows.length > MAX_IMPORT_ROWS) throw new PayloadTooLargeException(`Max ${MAX_IMPORT_ROWS} rows per import`);
    const [job] = await this.db.insert(importJobs).values({
      instituteId: ctx.instituteId!, kind: "users", status: "processing", filename: filename ?? null,
      totalRows: parsed.rows.length, csv, createdBy: ctx.userId,
    }).returning();
    return this.process(ctx, job!.id, parsed);
  }

  private parse(csv: string) {
    const res = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), {
      header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    });
    const fatal = res.errors.filter((e) => e.type === "Delimiter" || e.type === "Quotes");
    if (fatal.length) throw new BadRequestException(`Unreadable CSV: ${fatal[0]!.message}`);
    const headers = res.meta.fields ?? [];
    for (const required of ["name", "email"]) {
      if (!headers.includes(required)) throw new BadRequestException(`Missing required column: ${required}`);
    }
    return { rows: res.data, headers };
  }

  async process(ctx: RequestCtx, jobId: string, parsed: { rows: Record<string, string>[] }) {
    const instituteId = ctx.instituteId!;
    const errors: ImportRowError[] = [];
    let ok = 0;

    // lookups, one query each
    const batchRows = await this.db.select({ id: batches.id, name: batches.name }).from(batches);
    const batchByName = new Map(batchRows.map((b) => [b.name.trim().toLowerCase(), b.id]));
    const studentRows = await this.db.select({ id: students.id, rollNo: students.rollNo }).from(students);
    const studentByRoll = new Map(studentRows.filter((s) => s.rollNo).map((s) => [s.rollNo!.toLowerCase(), s.id]));
    const seenEmails = new Map<string, number>();
    const seenRolls = new Map<string, number>();

    for (let i = 0; i < parsed.rows.length; i++) {
      const line = i + 2; // header is line 1
      const raw = parsed.rows[i]!;
      const cleaned = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" && v.trim() !== "" ? v.trim() : undefined]));
      const v = importRowSchema.safeParse(cleaned);
      if (!v.success) {
        for (const issue of v.error.issues) errors.push({ row: line, field: String(issue.path[0] ?? "row"), message: issue.message });
        continue;
      }
      const row = v.data;
      const rowErrors = this.crossChecks(row, line, { batchByName, studentByRoll, seenEmails, seenRolls });
      if (rowErrors.errors.length) {
        errors.push(...rowErrors.errors);
        continue;
      }
      try {
        await this.db.transaction(async (tx) => {
          const userId = await this.people.ensureUser({ name: row.name, email: row.email, phone: row.phone });
          await this.people.insertPerson(tx as unknown as Db, instituteId, userId, {
            role: row.role, rollNo: row.roll_no, dob: row.dob, employeeCode: row.employee_code, relation: row.relation,
            childStudentIds: rowErrors.childIds,
          }, rowErrors.batchIds);
        });
        await this.people.invite(row.email, row.name);
        seenEmails.set(row.email, line);
        if (row.roll_no) seenRolls.set(row.roll_no.toLowerCase(), line);
        ok++;
      } catch (e) {
        const d = e instanceof DuplicateError ? e : toDuplicateError(e);
        errors.push({ row: line, field: d?.field ?? "row", message: d?.message ?? "Could not import this row" });
      }
    }

    const [job] = await this.db.update(importJobs).set({
      status: "done", succeededRows: ok, failedRows: new Set(errors.map((e) => e.row)).size, errors,
      completedAt: new Date(), updatedAt: new Date(),
    }).where(eq(importJobs.id, jobId)).returning();

    // invites are queued per successful row and sent after the request transaction commits
    return this.summary(job!);
  }

  private crossChecks(
    row: ImportRow, line: number,
    ctx: { batchByName: Map<string, string>; studentByRoll: Map<string, string>; seenEmails: Map<string, number>; seenRolls: Map<string, number> },
  ) {
    const errors: ImportRowError[] = [];
    const prev = ctx.seenEmails.get(row.email);
    if (prev) errors.push({ row: line, field: "email", message: `Duplicate of row ${prev} in this file` });
    if (row.roll_no) {
      const pr = ctx.seenRolls.get(row.roll_no.toLowerCase());
      if (pr) errors.push({ row: line, field: "roll_no", message: `Duplicate roll number of row ${pr} in this file` });
    }
    const batchIds: string[] = [];
    for (const name of (row.batches ?? "").split("|").map((s) => s.trim()).filter(Boolean)) {
      const id = ctx.batchByName.get(name.toLowerCase());
      if (!id) errors.push({ row: line, field: "batches", message: `Unknown batch "${name}"` });
      else batchIds.push(id);
    }
    if (row.role === "student" && !row.batches) {
      // allowed: enrol later
    }
    const childIds: string[] = [];
    if (row.role === "parent") {
      for (const roll of (row.children ?? "").split("|").map((s) => s.trim()).filter(Boolean)) {
        const id = ctx.studentByRoll.get(roll.toLowerCase());
        if (!id) errors.push({ row: line, field: "children", message: `No student with roll number "${roll}"` });
        else childIds.push(id);
      }
    }
    return { errors, batchIds, childIds };
  }

  private summary(job: typeof importJobs.$inferSelect) {
    return {
      id: job.id, status: job.status, filename: job.filename, totalRows: job.totalRows,
      succeededRows: job.succeededRows, failedRows: job.failedRows, errors: job.errors, completedAt: job.completedAt,
    };
  }

  async get(id: string) {
    const [job] = await this.db.select().from(importJobs).where(eq(importJobs.id, id)).limit(1);
    if (!job) throw new NotFoundException();
    return this.summary(job);
  }

  /** CSV of failed rows with the original columns plus row number and error messages. */
  async errorCsv(id: string) {
    const [job] = await this.db.select().from(importJobs).where(eq(importJobs.id, id)).limit(1);
    if (!job) throw new NotFoundException();
    const { rows, headers } = this.parse(job.csv ?? "");
    const byRow = new Map<number, string[]>();
    for (const e of job.errors) byRow.set(e.row, [...(byRow.get(e.row) ?? []), `${e.field ? e.field + ": " : ""}${e.message}`]);
    const out = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([line, msgs]) => ({
      row: line, ...Object.fromEntries(headers.map((h) => [h, rows[line - 2]?.[h] ?? ""])), errors: msgs.join("; "),
    }));
    return Papa.unparse(out, { columns: ["row", ...headers, "errors"] });
  }
}


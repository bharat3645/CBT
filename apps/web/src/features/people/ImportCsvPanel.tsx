"use client";

import * as React from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@cbt/ui";
import { ErrorNote, Pill, Panel, SuccessNote, Table, Td, errorText } from "@/components/ui-kit";
import { downloadCsv, useImportUsers, type ImportResult } from "./api";

/**
 * Bulk import (FR-003): POST /api/v1/imports/users. Rows are applied independently, so the result shows how many
 * succeeded plus a per-row error list, and the failed rows can be downloaded as errors.csv, fixed and re-uploaded.
 */
export function ImportCsvPanel({ defaultRole }: { defaultRole: "student" | "teacher" | "parent" }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [text, setText] = React.useState("");
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [dlError, setDlError] = React.useState<string | null>(null);
  const imp = useImportUsers();

  async function pickFile(f: File | null) {
    setFile(f);
    setResult(null);
    setText(f ? await f.text() : "");
  }

  async function run() {
    setResult(null);
    imp.mutate({ csv: text, filename: file?.name }, { onSuccess: setResult });
  }

  async function download(path: string, name: string) {
    setDlError(null);
    try {
      await downloadCsv(path, name);
    } catch (e) {
      setDlError(errorText(e));
    }
  }

  const failed = result ? result.failedRows : 0;
  return (
    <Panel
      title="Import from CSV"
      description={`Columns: role, name, email, phone, roll_no, dob (YYYY-MM-DD), employee_code, relation, batches (names separated by |), children (roll numbers separated by |). The role column defaults to student; this page is for ${defaultRole}s but any role may appear in the file.`}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" type="button" onClick={() => download("/imports/users/template", "users-template.csv")}>
            <Download /> Download template
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <span className="sr-only">CSV file</span>
            <input aria-label="CSV file" type="file" accept=".csv,text/csv" className="text-sm" onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <textarea
          aria-label="CSV contents"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          rows={5}
          placeholder={"role,name,email,roll_no\nstudent,Asha Rao,asha@example.com,R100"}
          className="w-full rounded-md border border-input bg-card p-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-3">
          <Button type="button" disabled={!text.trim() || imp.isPending} onClick={run}>
            <Upload /> {imp.isPending ? "Importing..." : "Import"}
          </Button>
          <span className="text-xs text-muted-foreground">Up to 5,000 rows. Each row is checked on its own, so one bad row never blocks the rest.</span>
        </div>
        <ErrorNote error={imp.error} />
        <ErrorNote error={dlError ? new Error(dlError) : null} />
        {result && (
          <div className="space-y-3" data-testid="import-result">
            <SuccessNote>
              Imported {result.succeededRows} of {result.totalRows} rows{failed ? `; ${failed} ${failed === 1 ? "row needs" : "rows need"} attention.` : "."}
            </SuccessNote>
            {result.errors.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Row errors</h3>
                  <Button variant="outline" size="sm" type="button" onClick={() => download(`/imports/${result.id}/errors.csv`, "import-errors.csv")}>
                    <Download /> Download errors.csv
                  </Button>
                </div>
                <Table head={["Row", "Field", "Problem"]}>
                  {result.errors.map((e, i) => (
                    <tr key={`${e.row}-${e.field}-${i}`}>
                      <Td>
                        <Pill tone="bad">Row {e.row}</Pill>
                      </Td>
                      <Td>{e.field ?? "-"}</Td>
                      <Td>{e.message}</Td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

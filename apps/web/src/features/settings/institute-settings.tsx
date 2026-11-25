"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@cbt/ui";
import { PageHeader } from "@/components/dashboard-kit";
import { ErrorNote, Field, Loading, Panel, Pill, SuccessNote, inputCls } from "@/components/ui-kit";
import { api } from "@/lib/api-client";

type Institute = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  brandColor: string | null;
  contactEmail: string | null;
  status: string;
  plan: string;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** FR-006: institute branding. GET /api/v1/institute, PATCH /api/v1/institute (name, logo URL, brand colour, contact email). */
export function InstituteSettings() {
  const qc = useQueryClient();
  const inst = useQuery({ queryKey: ["institute"], queryFn: () => api<Institute>("/institute") });
  const save = useMutation({
    mutationFn: (v: { name: string; logo: string | null; brandColor: string | null; contactEmail: string | null }) => api<Institute>("/institute", { method: "PATCH", body: v }),
    onSuccess: (row) => {
      qc.setQueryData(["institute"], row);
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const [form, setForm] = React.useState({ name: "", logo: "", brandColor: "", contactEmail: "" });
  const [saved, setSaved] = React.useState(false);
  const loadedId = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (inst.data && loadedId.current !== inst.data.id) {
      loadedId.current = inst.data.id;
      setForm({ name: inst.data.name, logo: inst.data.logo ?? "", brandColor: inst.data.brandColor ?? "", contactEmail: inst.data.contactEmail ?? "" });
    }
  }, [inst.data]);

  if (inst.isLoading) return <Loading />;
  if (inst.error || !inst.data) return <ErrorNote error={inst.error ?? new Error("Could not load the institute")} />;
  const i = inst.data;
  const colorOk = !form.brandColor || HEX.test(form.brandColor);
  const preview = HEX.test(form.brandColor) ? form.brandColor : "#c2543b";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    save.mutate(
      { name: form.name.trim(), logo: form.logo.trim() || null, brandColor: form.brandColor.trim() || null, contactEmail: form.contactEmail.trim() || null },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Branding and contact details for your institute. Students, teachers and parents see these." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Institute profile">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Institute name">
              <input required minLength={2} maxLength={200} className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Contact email" hint="Shown to families and used for institute notices.">
              <input type="email" className={inputCls} value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand colour" hint={colorOk ? "Used for buttons and highlights. Leave empty for the default." : "Use a 6 digit hex colour such as #c2543b."}>
                <div className="flex items-center gap-2">
                  <input aria-label="Pick brand colour" type="color" value={preview} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded-md border border-input bg-card p-1" />
                  <input aria-label="Brand colour" className={inputCls} placeholder="#c2543b" value={form.brandColor} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} />
                </div>
              </Field>
              <Field label="Logo URL" hint="A link to a square image (PNG, JPG, SVG).">
                <input type="url" className={inputCls} placeholder="https://..." value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} />
              </Field>
            </div>
            <ErrorNote error={save.error} />
            {saved && <SuccessNote>Saved.</SuccessNote>}
            <Button type="submit" disabled={save.isPending || !colorOk || !form.name.trim()}>
              {save.isPending ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel title="Preview">
            <div className="flex items-center gap-3 rounded-md bg-sidebar p-3 text-sidebar-foreground">
              {form.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logo} alt="" className="size-8 rounded-md bg-card object-contain" />
              ) : (
                <span className="flex size-8 items-center justify-center rounded-md text-sm font-bold text-white" style={{ background: preview }}>
                  {(form.name || "I").slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="text-sm font-semibold">{form.name || "Institute"}</span>
            </div>
            <button type="button" className="mt-3 rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: preview }}>
              Primary button
            </button>
          </Panel>
          <Panel title="Account">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Identifier</dt>
                <dd className="font-mono text-xs">{i.slug}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="capitalize">{i.plan}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Pill tone={i.status === "approved" ? "good" : "warn"}>{i.status}</Pill>
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { Field, FIELD_INPUT } from "@/components/ui/drawer";
import { Banner } from "@/components/ui/panel";
import { readApiError, type FieldErrors } from "@/lib/form-errors";
import { NewOrgUnitFormSchema } from "@/lib/org-unit-schema";
import { CARD_GLASS as CARD, CARD_BG, PRIMARY, QUIET, SECONDARY } from "@/lib/surface";

/**
 * docs/38 — markets (= subsidiaries): code (immutable — projects, reports and the
 * status-report matcher key on it), name, flag. Never deleted: market tracks, gate states
 * and check-ins hang off them. Rename or re-flag inline.
 */

interface Unit {
  id: string;
  code: string;
  name: string;
  flag: string | null;
  kind: string;
  projects: number;
  createdAt: string;
}

const INPUT = `h-8 rounded-[8px] border border-[var(--input)] bg-background px-2.5 text-[12.5px] text-foreground focus:border-[var(--ds-ink)] focus:ring-1 focus:ring-[var(--ds-ink)] focus:ring-offset-0 focus:outline-none`;

export function OrgUnitsPanel({ initial }: { initial: Unit[] }) {
  const [rows, setRows] = useState<Unit[]>(initial);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ code: "", name: "", flag: "", kind: "Market" });
  const [busy, setBusy] = useState<string | null>(null);
  // formError: the New Market form's banner. rowError: a rename / re-flag in the table.
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  // docs/08 § Errors: the form's problems show on their field; Add stays enabled.
  const fe = useFieldErrors({ schema: NewOrgUnitFormSchema, values: { code: draft.code, name: draft.name, flag: draft.flag }, idPrefix: "mkt" });

  const call = async (key: string, url: string, init: RequestInit, onFields?: (f: FieldErrors) => void) => {
    setBusy(key);
    setFormError(null);
    setRowError(null);
    const res = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
    const d = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      const { message, fields } = readApiError(d, "Could not save.");
      const { _: root, ...onField } = fields;
      if (onFields && Object.keys(onField).length > 0) {
        onFields(onField);
        if (root) setFormError(root);
      } else if (onFields) setFormError(message);
      else setRowError(message);
      return false;
    }
    setRows((d.data as Unit[]).map((u) => ({ ...u, createdAt: String(u.createdAt) })));
    return true;
  };

  const create = async () => {
    if (!fe.validate(["code", "name", "flag"])) return;
    if (
      await call(
        "new",
        "/api/admin/org-units",
        { method: "POST", body: JSON.stringify({ code: draft.code.trim().toUpperCase(), name: draft.name.trim(), flag: draft.flag.trim() || null, kind: draft.kind }) },
        (f) => fe.setServerErrors(f, ["code", "name", "flag"]),
      )
    ) {
      setDraft({ code: "", name: "", flag: "", kind: "Market" });
      fe.reset();
      setAdding(false);
    }
  };
  const patch = (id: string, body: Record<string, unknown>) => call(id, `/api/admin/org-units/${id}`, { method: "PATCH", body: JSON.stringify(body) });

  return (
    <section className={`${CARD} overflow-hidden`} style={CARD_BG} aria-labelledby="org-units-title">
      <div className="flex flex-wrap items-center gap-3 p-[12px_16px]">
        <h2 id="org-units-title" className="text-[13.5px] font-semibold text-[var(--qink)]">
          Markets
        </h2>
        <span className="text-[12px] text-[var(--ink4)]">Where a product can ship — Kenya, Uganda, a subsidiary. Projects pick them on their Markets tab.</span>
        <button type="button" onClick={() => setAdding((a) => !a)} className={`${SECONDARY} ml-auto gap-1.5`}>
          <Plus className="size-3.5" aria-hidden /> New Market
        </button>
      </div>
      {adding && (
        <form
          className="flex flex-col gap-3 border-t border-[var(--hair2)] bg-[var(--card2)] p-[12px_16px]"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          {formError && <Banner tone="bad">{formError}</Banner>}
          <div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)_110px]">
            <Field label="Code" htmlFor={fe.idOf("code")} error={fe.errors.code}>
              <input {...fe.bind("code")} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} maxLength={12} placeholder="DRC" className={`${FIELD_INPUT} font-mono uppercase`} />
            </Field>
            <Field label="Name" htmlFor={fe.idOf("name")} error={fe.errors.name}>
              <input {...fe.bind("name")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} placeholder="DR Congo" className={FIELD_INPUT} />
            </Field>
            <Field label="Flag" htmlFor={fe.idOf("flag")} error={fe.errors.flag}>
              <input {...fe.bind("flag")} value={draft.flag} onChange={(e) => setDraft({ ...draft, flag: e.target.value })} maxLength={8} placeholder="🇨🇩" className={FIELD_INPUT} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy !== null} className={PRIMARY}>
              {busy === "new" ? "Adding…" : "Add"}
            </button>
            <button type="button" onClick={() => { setAdding(false); setFormError(null); fe.reset(); }} className={QUIET}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {rowError && (
        <div className="px-4 py-2">
          <Banner tone="bad">{rowError}</Banner>
        </div>
      )}
      <table className="w-full border-t border-[var(--hair2)] text-left text-[12.5px]">
        <thead>
          <tr className="font-mono text-[9px] font-bold uppercase tracking-[1px] text-[var(--ink4)]">
            <th className="px-4 py-2">Code</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Flag</th>
            <th className="px-4 py-2 text-right">Projects</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-t border-[var(--hair2)]">
              <td className="px-4 py-2 font-mono text-[11.5px] font-semibold text-[var(--qink)]">{u.code}</td>
              <td className="px-4 py-2">
                <input defaultValue={u.name} maxLength={80} aria-label={`${u.code} name`} onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v === u.name) return;
                  if (v.length < 2) {
                    setRowError(`${u.code}: ${v ? "the name must be at least 2 characters." : "enter a name."}`);
                    return;
                  }
                  void patch(u.id, { name: v });
                }} className={`${INPUT} h-7 w-full max-w-[260px]`} />
              </td>
              <td className="px-4 py-2">
                <input defaultValue={u.flag ?? ""} maxLength={8} aria-label={`${u.code} flag`} onBlur={(e) => e.target.value.trim() !== (u.flag ?? "") && void patch(u.id, { flag: e.target.value.trim() || null })} className={`${INPUT} h-7 w-[64px]`} />
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--ink3)]">{u.projects}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

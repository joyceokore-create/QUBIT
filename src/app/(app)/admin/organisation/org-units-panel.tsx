"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { Drawer, DrawerFooter, DrawerFrame, DrawerHeader, Field, FIELD_INPUT } from "@/components/ui/drawer";
import { InHeaderSlot } from "@/components/list/header-slot";
import { MARKETS_HEADER_SLOT } from "@/lib/header-slots";
import { cn } from "@/lib/utils";
import { Banner } from "@/components/ui/panel";
import { readApiError, type FieldErrors } from "@/lib/form-errors";
import { NewOrgUnitFormSchema } from "@/lib/org-unit-schema";
import { CARD_GLASS as CARD, CARD_BG, INPUT, PRIMARY, SECONDARY, THEAD, TROW } from "@/lib/surface";

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

  const closeAdd = () => {
    setAdding(false);
    setFormError(null);
    fe.reset();
  };

  return (
    <>
      {/* Designer, 12 Nov 2026: the page's one red primary sits in the page header. */}
      <InHeaderSlot id={MARKETS_HEADER_SLOT}>
        <button type="button" onClick={() => setAdding(true)} className={PRIMARY}>
          <Plus className="size-4" aria-hidden /> New Market
        </button>
      </InHeaderSlot>

      <Drawer open={adding} onClose={closeAdd}>
        <DrawerFrame
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
          header={<DrawerHeader title="New Market" subtitle="Where a product can ship — a country or a subsidiary. Projects pick it on their Markets tab." />}
          footer={
            <DrawerFooter>
              <button type="button" onClick={closeAdd} className={SECONDARY}>
                Cancel
              </button>
              <button type="submit" disabled={busy !== null} className={PRIMARY}>
                {busy === "new" ? "Adding…" : "Add Market"}
              </button>
            </DrawerFooter>
          }
        >
          {formError && <Banner tone="bad">{formError}</Banner>}
          <Field label="Code" htmlFor={fe.idOf("code")} error={fe.errors.code} hint="Short and unique, e.g. KE.">
            <input {...fe.bind("code")} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} maxLength={12} placeholder="DRC" className={`${FIELD_INPUT} font-mono uppercase`} />
          </Field>
          <Field label="Name" htmlFor={fe.idOf("name")} error={fe.errors.name}>
            <input {...fe.bind("name")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} placeholder="DR Congo" className={FIELD_INPUT} />
          </Field>
          <Field label="Flag (Optional)" htmlFor={fe.idOf("flag")} error={fe.errors.flag}>
            <input {...fe.bind("flag")} value={draft.flag} onChange={(e) => setDraft({ ...draft, flag: e.target.value })} maxLength={8} placeholder="🇨🇩" className={`${FIELD_INPUT} max-w-[120px]`} />
          </Field>
        </DrawerFrame>
      </Drawer>

    <section className={cn(CARD, "flex flex-col gap-3 px-[18px] py-4")} style={CARD_BG} aria-label="Markets">
      {rowError && <Banner tone="bad">{rowError}</Banner>}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left text-[12.5px]">
        <caption className="sr-only">Markets</caption>
        <thead className={THEAD}>
          <tr>
            <th scope="col" className="w-[120px]">Code</th>
            <th scope="col">Name</th>
            <th scope="col" className="w-[110px]">Flag</th>
            <th scope="col" className="w-[100px] text-right!">Projects</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className={cn(TROW, "transition-colors hover:[&>td]:bg-[var(--ds-surface2)]")}>
              <td className="font-mono text-[11.5px] font-semibold text-[var(--ds-ink)]">{u.code}</td>
              <td>
                <input defaultValue={u.name} maxLength={80} aria-label={`${u.code} name`} onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v === u.name) return;
                  if (v.length < 2) {
                    setRowError(`${u.code}: ${v ? "the name must be at least 2 characters." : "enter a name."}`);
                    return;
                  }
                  void patch(u.id, { name: v });
                }} className={`${INPUT} h-8 w-full max-w-[280px]`} />
              </td>
              <td>
                <input defaultValue={u.flag ?? ""} maxLength={8} aria-label={`${u.code} flag`} onBlur={(e) => e.target.value.trim() !== (u.flag ?? "") && void patch(u.id, { flag: e.target.value.trim() || null })} className={`${INPUT} h-8 w-[72px]`} />
              </td>
              <td className="text-right tabular-nums text-[var(--ds-ink2)]">{u.projects}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="text-[12px] text-[var(--ds-ink3)]">Edit a name or flag in place; it saves when you leave the field.</p>
    </section>
    </>
  );
}

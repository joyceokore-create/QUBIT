"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, PRIMARY, QUIET, SECONDARY } from "@/lib/surface";

/**
 * docs/38 — org units: code (immutable — projects, reports and the status-report matcher
 * key on it), name, flag, kind (Market = a geography a product ships into; Internal = a
 * subsidiary of this tenant). Never deleted: instances, gate states and check-ins hang
 * off them. Rename, re-flag or change the kind inline.
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

const INPUT = `h-8 rounded-[8px] border border-[var(--input)] bg-background px-2.5 text-[12.5px] text-foreground focus:border-brand ${FOCUS}`;

export function OrgUnitsPanel({ initial }: { initial: Unit[] }) {
  const [rows, setRows] = useState<Unit[]>(initial);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ code: "", name: "", flag: "", kind: "Market" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (key: string, url: string, init: RequestInit) => {
    setBusy(key);
    setError(null);
    const res = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
    const d = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setError(d?.error?.message ?? "Could not save.");
      return false;
    }
    setRows((d.data as Unit[]).map((u) => ({ ...u, createdAt: String(u.createdAt) })));
    return true;
  };

  const create = async () => {
    if (await call("new", "/api/admin/org-units", { method: "POST", body: JSON.stringify({ code: draft.code.trim().toUpperCase(), name: draft.name.trim(), flag: draft.flag.trim() || null, kind: draft.kind }) })) {
      setDraft({ code: "", name: "", flag: "", kind: "Market" });
      setAdding(false);
    }
  };
  const patch = (id: string, body: Record<string, unknown>) => call(id, `/api/admin/org-units/${id}`, { method: "PATCH", body: JSON.stringify(body) });

  return (
    <section className={`${CARD} overflow-hidden`} style={CARD_BG} aria-labelledby="org-units-title">
      <div className="flex flex-wrap items-center gap-3 p-[12px_16px]">
        <h2 id="org-units-title" className="text-[13.5px] font-semibold text-[var(--qink)]">
          Org units
        </h2>
        <span className="text-[12px] text-[var(--ink4)]">Markets a product ships into, and internal subsidiaries. Projects pick them as instances.</span>
        <button type="button" onClick={() => setAdding((a) => !a)} className={`${SECONDARY} ml-auto gap-1.5`}>
          <Plus className="size-3.5" aria-hidden /> New org unit
        </button>
      </div>
      {adding && (
        <form
          className="flex flex-wrap items-end gap-2 border-t border-[var(--hair2)] bg-[var(--card2)] p-[12px_16px]"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--ink4)]">
            Code
            <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} maxLength={12} placeholder="DRC" required className={`${INPUT} w-[96px] font-mono uppercase`} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--ink4)]">
            Name
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} placeholder="DR Congo" required className={`${INPUT} w-[200px]`} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--ink4)]">
            Flag
            <input value={draft.flag} onChange={(e) => setDraft({ ...draft, flag: e.target.value })} maxLength={8} placeholder="🇨🇩" className={`${INPUT} w-[64px]`} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--ink4)]">
            Kind
            <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} className={INPUT}>
              <option value="Market">Market</option>
              <option value="Internal">Internal subsidiary</option>
            </select>
          </label>
          <button type="submit" disabled={busy !== null} className={PRIMARY}>
            {busy === "new" ? "Adding…" : "Add"}
          </button>
          <button type="button" onClick={() => setAdding(false)} className={QUIET}>
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="px-4 py-2 text-[12px] text-[var(--bad)]">
          {error}
        </p>
      )}
      <table className="w-full border-t border-[var(--hair2)] text-left text-[12.5px]">
        <thead>
          <tr className="font-mono text-[9px] font-bold uppercase tracking-[1px] text-[var(--ink4)]">
            <th className="px-4 py-2">Code</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Flag</th>
            <th className="px-4 py-2">Kind</th>
            <th className="px-4 py-2 text-right">Projects</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-t border-[var(--hair2)]">
              <td className="px-4 py-2 font-mono text-[11.5px] font-semibold text-[var(--qink)]">{u.code}</td>
              <td className="px-4 py-2">
                <input defaultValue={u.name} maxLength={80} aria-label={`${u.code} name`} onBlur={(e) => e.target.value.trim() !== u.name && e.target.value.trim().length >= 2 && void patch(u.id, { name: e.target.value.trim() })} className={`${INPUT} h-7 w-full max-w-[260px]`} />
              </td>
              <td className="px-4 py-2">
                <input defaultValue={u.flag ?? ""} maxLength={8} aria-label={`${u.code} flag`} onBlur={(e) => e.target.value.trim() !== (u.flag ?? "") && void patch(u.id, { flag: e.target.value.trim() || null })} className={`${INPUT} h-7 w-[64px]`} />
              </td>
              <td className="px-4 py-2">
                <select value={u.kind} onChange={(e) => void patch(u.id, { kind: e.target.value })} aria-label={`${u.code} kind`} className={`${INPUT} h-7`}>
                  <option value="Market">Market</option>
                  <option value="Internal">Internal subsidiary</option>
                </select>
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--ink3)]">{u.projects}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

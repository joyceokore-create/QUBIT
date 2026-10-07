"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, ShieldAlert, X } from "lucide-react";
import type { NamedInstanceJson } from "@/components/panels/project-panel-json";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, PRIMARY, QUIET, SECONDARY } from "@/lib/surface";

/**
 * docs/38 — the Delivery tab's Instances grid: rows are the product's named instances
 * (Schools, Marketplace …), columns the product level and each market. A cell is the
 * instance's state there (Planned · Build · UAT · Live · N/A) over its gate-derived %;
 * clicking a cell scopes the gates matrix above to that instance × market, so each
 * instance runs the same track in every market. Add / rename / remove inline (the PM or
 * project:stage); everyone else reads.
 */

const STATES = ["Planned", "Build", "UAT", "Live", "NotApplicable"] as const;
const STATE_LABEL: Record<string, string> = { Planned: "Planned", Build: "Build", UAT: "UAT", Live: "Live", NotApplicable: "N/A" };
const STATE_TOK: Record<string, string> = { Planned: "--ink4", Build: "--qinfo", UAT: "--warn", Live: "--ok", NotApplicable: "--ink5" };

export function InstancesSection({
  projectId,
  initial,
  markets,
  canManage,
  selected,
  onSelect,
}: {
  projectId: string;
  initial: NamedInstanceJson[];
  markets: { orgUnitId: string; code: string; flag: string | null }[];
  canManage: boolean;
  selected: { instance: string | null; market: string | null };
  onSelect: (instanceId: string | null, orgUnitId: string | null) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<NamedInstanceJson[]>(initial);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const columns: { orgUnitId: string | null; label: string }[] = [{ orgUnitId: null, label: "Product" }, ...markets.map((m) => ({ orgUnitId: m.orgUnitId, label: `${m.flag ? `${m.flag} ` : ""}${m.code}` }))];

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
    if (Array.isArray(d?.data)) setRows(d.data);
    router.refresh();
    return true;
  };
  const add = async () => {
    if (!name.trim()) return;
    if (await call("add", `/api/projects/${projectId}/instances`, { method: "POST", body: JSON.stringify({ name: name.trim() }) })) {
      setName("");
      setAdding(false);
    }
  };
  const setState = (instanceId: string, orgUnitId: string | null, state: string) =>
    call(`${instanceId}:${orgUnitId ?? "-"}`, `/api/projects/${projectId}/instances/${instanceId}/state`, { method: "PUT", body: JSON.stringify({ orgUnitId, state }) });
  const remove = (instanceId: string) => call(instanceId, `/api/projects/${projectId}/instances/${instanceId}`, { method: "DELETE" });

  return (
    <section className={`${CARD} p-4`} style={CARD_BG} aria-labelledby="instances-title">
      <div className="mb-2.5 flex flex-wrap items-center gap-3">
        <h3 id="instances-title" className="text-[13px] font-semibold text-foreground">
          Instances
        </h3>
        <span className="text-[11.5px] text-[var(--ink4)]">
          {rows.length === 0 ? "Named variants of the product (for Schools, for Marketplace …) — each runs as its own project, the same track in every market." : "Click a cell to open that instance's gates for that market; the track is one for all markets and may differ per instance."}
        </span>
        {canManage && (
          <button type="button" onClick={() => setAdding((a) => !a)} className={`${SECONDARY} ml-auto gap-1.5 px-2.5 py-1 text-[12px]`}>
            <Plus className="size-3.5" aria-hidden /> Add instance
          </button>
        )}
      </div>
      {adding && (
        <form
          className="mb-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="e.g. For Schools" aria-label="Instance name" className={`h-8 min-w-[220px] rounded-[8px] border border-[var(--input)] bg-background px-2.5 text-[12.5px] text-foreground focus:border-brand ${FOCUS}`} />
          <button type="submit" disabled={busy !== null || !name.trim()} className={PRIMARY}>
            {busy === "add" ? "Adding…" : "Add"}
          </button>
          <button type="button" onClick={() => setAdding(false)} className={QUIET}>
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mb-2 flex items-center gap-1.5 text-[12px] text-[var(--bad)]">
          <ShieldAlert className="size-3" aria-hidden /> {error}
        </p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="font-mono text-[9px] font-bold uppercase tracking-[1px] text-[var(--ink4)]">
                <th className="py-1.5 pr-3">Instance</th>
                {columns.map((c) => (
                  <th key={c.orgUnitId ?? "product"} className="px-2 py-1.5 text-center">
                    {c.label}
                  </th>
                ))}
                {canManage && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--hair2)]">
                  <td className="py-2 pr-3">
                    <span className="font-semibold text-[var(--qink)]">{r.name}</span>
                    <span className="ml-1.5 font-mono text-[10px] text-[var(--ink4)]">{r.code}</span>
                    <span className="block text-[10.5px] text-[var(--ink4)]" title="One track for all markets — pick a template in the gates card while this instance is selected">
                      track · {r.checkpointTemplateName ?? "project's"}
                    </span>
                  </td>
                  {columns.map((c) => {
                    const cell = r.cells.find((x) => x.orgUnitId === c.orgUnitId) ?? { orgUnitId: c.orgUnitId, state: "Planned", note: null, progress: 0 };
                    const on = selected.instance === r.id && selected.market === c.orgUnitId;
                    const tok = STATE_TOK[cell.state] ?? "--ink4";
                    const k = `${r.id}:${c.orgUnitId ?? "-"}`;
                    return (
                      <td key={k} className="px-2 py-2 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          {canManage ? (
                            <select
                              value={cell.state}
                              onChange={(e) => void setState(r.id, c.orgUnitId, e.target.value)}
                              aria-label={`${r.name} · ${c.label} state`}
                              className={`h-6 rounded-full border px-2 text-[11px] font-semibold ${FOCUS}`}
                              style={{ color: `var(${tok})`, borderColor: `color-mix(in oklab, var(${tok}) 40%, transparent)`, background: `color-mix(in oklab, var(${tok}) 10%, transparent)` }}
                            >
                              {STATES.map((s) => (
                                <option key={s} value={s}>
                                  {STATE_LABEL[s]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ color: `var(${tok})`, borderColor: `color-mix(in oklab, var(${tok}) 40%, transparent)` }}>
                              {STATE_LABEL[cell.state] ?? cell.state}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => onSelect(on ? null : r.id, on ? null : c.orgUnitId)}
                            aria-pressed={on}
                            className={`rounded-[4px] font-mono text-[10.5px] tabular-nums transition-colors ${on ? "text-[var(--brand)]" : "text-[var(--ink4)] hover:text-[var(--qink)]"} ${FOCUS}`}
                            title={on ? "Back to the product's gates" : `Open ${r.name}'s gates ${c.orgUnitId ? `in ${c.label}` : "at product level"}`}
                          >
                            {busy === k ? <Loader2 className="inline size-3 animate-spin" aria-hidden /> : `${cell.progress}%`}
                          </button>
                        </div>
                      </td>
                    );
                  })}
                  {canManage && (
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => void remove(r.id)} aria-label={`Remove ${r.name}`} className={`${QUIET} px-1 text-[var(--ink4)]`} title="Remove (only while it carries no work)">
                        <X className="size-3" aria-hidden />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

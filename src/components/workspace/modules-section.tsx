"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, ShieldAlert, X } from "lucide-react";
import type { NamedInstanceJson } from "@/components/panels/project-panel-json";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, PRIMARY, QUIET, SECONDARY } from "@/lib/surface";

/**
 * docs/38 — the Delivery tab's Modules grid: the product's components or channels (Swipe
 * P20 POS, USSD, Agent Portal …), each under the product or under one instance, tracked by
 * a state per market (Planned · Build · UAT · Live · N/A). "Own gates" is chosen per module
 * when it is added and can be switched later: with it on, the % is gate-derived and a cell
 * opens that module's gates for that market; off, the module is state-only.
 */

const STATES = ["Planned", "Build", "UAT", "Live", "NotApplicable"] as const;
const STATE_LABEL: Record<string, string> = { Planned: "Planned", Build: "Build", UAT: "UAT", Live: "Live", NotApplicable: "N/A" };
const STATE_TOK: Record<string, string> = { Planned: "--ink4", Build: "--qinfo", UAT: "--warn", Live: "--ok", NotApplicable: "--ink5" };
/** "Agent channels" → "agent channel"; "Modules" → "module". */
const singular = (label: string) => label.toLowerCase().replace(/s$/, "");
const INPUT = `h-8 rounded-[8px] border border-[var(--input)] bg-background px-2.5 text-[12.5px] text-foreground focus:border-brand ${FOCUS}`;

export function ModulesSection({
  projectId,
  label = "Modules",
  initial,
  instances,
  markets,
  canManage,
  selected,
  onSelect,
}: {
  projectId: string;
  /** What this product calls its modules ("Agent channels" for Swipe). */
  label?: string;
  initial: NamedInstanceJson[];
  /** The product's named instances a module may sit under. */
  instances: { id: string; name: string }[];
  markets: { orgUnitId: string; code: string; flag: string | null }[];
  canManage: boolean;
  selected: { instance: string | null; market: string | null };
  onSelect: (moduleId: string | null, orgUnitId: string | null) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<NamedInstanceJson[]>(initial);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", parentId: "", ownGates: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // docs/38 — at All every market is a column (edit any); with a market selected, that
  // market alone is edited.
  const allColumns: { orgUnitId: string | null; label: string }[] = [{ orgUnitId: null, label: "Product" }, ...markets.map((m) => ({ orgUnitId: m.orgUnitId, label: `${m.flag ? `${m.flag} ` : ""}${m.code}` }))];
  const columns = selected.market ? allColumns.filter((c) => c.orgUnitId === selected.market) : allColumns;
  const groups: { parentId: string | null; label: string; rows: NamedInstanceJson[] }[] = [
    { parentId: null, label: "Product", rows: rows.filter((r) => !r.parentId) },
    ...instances.map((i) => ({ parentId: i.id, label: i.name, rows: rows.filter((r) => r.parentId === i.id) })),
  ].filter((g) => g.rows.length > 0 || g.parentId === null);

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
    if (!draft.name.trim()) return;
    if (await call("add", `/api/projects/${projectId}/instances`, { method: "POST", body: JSON.stringify({ name: draft.name.trim(), kind: "module", parentId: draft.parentId || null, ownGates: draft.ownGates }) })) {
      setDraft({ name: "", parentId: "", ownGates: false });
      setAdding(false);
    }
  };
  const setState = (id: string, orgUnitId: string | null, state: string) => call(`${id}:${orgUnitId ?? "-"}`, `/api/projects/${projectId}/instances/${id}/state`, { method: "PUT", body: JSON.stringify({ orgUnitId, state }) });
  const toggleGates = (id: string, ownGates: boolean) => call(id, `/api/projects/${projectId}/instances/${id}`, { method: "PATCH", body: JSON.stringify({ ownGates }) });
  const remove = (id: string) => call(id, `/api/projects/${projectId}/instances/${id}`, { method: "DELETE" });

  return (
    <section className={`${CARD} p-4`} style={CARD_BG} aria-labelledby="modules-title">
      <div className="mb-2.5 flex flex-wrap items-center gap-3">
        <h3 id="modules-title" className="text-[13px] font-semibold text-foreground">
          {label}
        </h3>
        <span className="text-[11.5px] text-[var(--ink4)]">
          {rows.length === 0 ? "Components or channels of the product (POS, USSD, Agent Portal …) — a state per market; own gates per module if you want them." : "A state per market. Modules with own gates show a % — click it to open their gates for that market."}
        </span>
        {canManage && (
          <button type="button" onClick={() => setAdding((a) => !a)} className={`${SECONDARY} ml-auto gap-1.5 px-2.5 py-1 text-[12px]`}>
            <Plus className="size-3.5" aria-hidden /> Add {singular(label)}
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
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} autoFocus placeholder="e.g. USSD" aria-label={`${singular(label)} name`} className={`${INPUT} min-w-[180px]`} />
          {instances.length > 0 && (
            <select value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })} aria-label="Under" className={INPUT}>
              <option value="">Under the product</option>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  Under {i.name}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--ink3)]">
            <input type="checkbox" checked={draft.ownGates} onChange={(e) => setDraft({ ...draft, ownGates: e.target.checked })} className="size-3.5 accent-[var(--brand)]" />
            Its own gates
          </label>
          <button type="submit" disabled={busy !== null || !draft.name.trim()} className={PRIMARY}>
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
          <table className="w-full min-w-[460px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="font-mono text-[9px] font-bold uppercase tracking-[1px] text-[var(--ink4)]">
                <th className="py-1.5 pr-3">{singular(label)}</th>
                {columns.map((c) => (
                  <th key={c.orgUnitId ?? "product"} className="px-2 py-1.5 text-center">
                    {c.label}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-center">Own gates</th>
                {canManage && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.parentId ?? "product"} group={g} columns={columns} canManage={canManage} busy={busy} selected={selected} onSelect={onSelect} setState={setState} toggleGates={toggleGates} remove={remove} showHeader={groups.length > 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GroupRows({
  group,
  columns,
  canManage,
  busy,
  selected,
  onSelect,
  setState,
  toggleGates,
  remove,
  showHeader,
}: {
  group: { parentId: string | null; label: string; rows: NamedInstanceJson[] };
  columns: { orgUnitId: string | null; label: string }[];
  canManage: boolean;
  busy: string | null;
  selected: { instance: string | null; market: string | null };
  onSelect: (moduleId: string | null, orgUnitId: string | null) => void;
  setState: (id: string, orgUnitId: string | null, state: string) => Promise<boolean>;
  toggleGates: (id: string, ownGates: boolean) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  showHeader: boolean;
}) {
  return (
    <>
      {showHeader && (
        <tr className="border-t border-[var(--hair2)]">
          <td colSpan={columns.length + 2 + (canManage ? 1 : 0)} className="bg-[var(--card2)] px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[.8px] text-[var(--ink4)]">
            {group.label}
          </td>
        </tr>
      )}
      {group.rows.map((r) => (
        <tr key={r.id} className="border-t border-[var(--hair2)]">
          <td className="py-2 pr-3">
            <span className="font-semibold text-[var(--qink)]">{r.name}</span>
            <span className="ml-1.5 font-mono text-[10px] text-[var(--ink4)]">{r.code}</span>
            {r.ownGates && (
              <span className="block text-[10.5px] text-[var(--ink4)]" title="Pick a template in the gates card while this module is selected">
                track · {r.checkpointTemplateName ?? "project's"}
              </span>
            )}
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
                  {r.ownGates ? (
                    <button
                      type="button"
                      onClick={() => onSelect(on ? null : r.id, on ? null : c.orgUnitId)}
                      aria-pressed={on}
                      className={`rounded-[4px] font-mono text-[10.5px] tabular-nums transition-colors ${on ? "text-[var(--brand)]" : "text-[var(--ink4)] hover:text-[var(--qink)]"} ${FOCUS}`}
                      title={on ? "Back to the product's gates" : `Open ${r.name}'s gates ${c.orgUnitId ? `in ${c.label}` : "at product level"}`}
                    >
                      {busy === k ? <Loader2 className="inline size-3 animate-spin" aria-hidden /> : `${cell.progress}%`}
                    </button>
                  ) : (
                    busy === k && <Loader2 className="size-3 animate-spin text-[var(--ink4)]" aria-hidden />
                  )}
                </div>
              </td>
            );
          })}
          <td className="px-2 py-2 text-center">
            {canManage ? (
              <input type="checkbox" checked={r.ownGates} onChange={(e) => void toggleGates(r.id, e.target.checked)} aria-label={`${r.name} has its own gates`} className="size-3.5 accent-[var(--brand)]" />
            ) : (
              <span className="text-[11px] text-[var(--ink4)]">{r.ownGates ? "Yes" : "—"}</span>
            )}
          </td>
          {canManage && (
            <td className="py-2 text-right">
              <button type="button" onClick={() => void remove(r.id)} aria-label={`Remove ${r.name}`} className={`${QUIET} px-1 text-[var(--ink4)]`} title="Remove (only while it carries no work)">
                <X className="size-3" aria-hidden />
              </button>
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, ShieldAlert, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, PRIMARY, QUIET, SECONDARY, ragFill } from "@/lib/surface";

/**
 * docs/38 — the Instances tab: where the product ships (markets / subsidiaries), each with
 * its lead (when the project's pmScope is "instance"), status, derived progress, a note
 * and its own set-up checklist. Add from the org units the project's label allows; retire
 * (never delete) when an instance is wound down. Managing is a governance act (the PM or
 * project:stage) — everyone else reads.
 */

interface Instance {
  orgUnitId: string;
  code: string;
  name: string;
  flag: string | null;
  kind: string;
  status: string;
  progress: number;
  leadUserId: string | null;
  leadName: string | null;
  note: string | null;
}
interface Unit {
  id: string;
  code: string;
  name: string;
  flag: string | null;
  kind: string;
}
interface Setup {
  gates: boolean;
  documents: boolean;
  lead: boolean;
  youtrack: boolean | null;
  thisWeek: boolean;
  done: number;
  total: number;
}
interface Person {
  userId: string;
  name: string;
}

const STATUSES = ["Planning", "InProgress", "UAT", "Live", "OnHold"] as const;
const STATUS_LABEL: Record<string, string> = { Planning: "Planning", InProgress: "In progress", UAT: "UAT", Live: "Live", OnHold: "On hold", Retired: "Retired" };
const INPUT = `h-8 rounded-[8px] border border-[var(--input)] bg-background px-2.5 text-[12.5px] text-foreground focus:border-brand ${FOCUS}`;

export function InstancesTab({
  projectId,
  label,
  pmScope,
  initial,
  onSelect,
}: {
  projectId: string;
  label: string;
  pmScope: string;
  initial: Instance[];
  /** Jump the workspace to this instance (the header switch). */
  onSelect: (orgUnitId: string) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Instance[]>(initial);
  const [addable, setAddable] = useState<Unit[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setups, setSetups] = useState<Record<string, Setup>>({});
  const plural = `${label.toLowerCase()}s`;

  const load = async () => {
    const res = await fetch(`/api/projects/${projectId}/instances`);
    const d = await res.json().catch(() => null);
    if (!res.ok || !d?.data) return;
    setRows(d.data.instances);
    setAddable(d.data.addable);
    setCanManage(d.data.canManage);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  useEffect(() => {
    if (pmScope !== "instance" || !canManage) return;
    void fetch("/api/staffing/bench")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPeople(((d?.data ?? d?.items ?? []) as { userId: string; name: string }[]).map((p) => ({ userId: p.userId, name: p.name }))))
      .catch(() => {});
  }, [pmScope, canManage]);
  useEffect(() => {
    for (const r of rows) {
      if (setups[r.orgUnitId]) continue;
      void fetch(`/api/projects/${projectId}/instances/${r.orgUnitId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((d) => d?.data?.setup && setSetups((s) => ({ ...s, [r.orgUnitId]: d.data.setup })))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

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
    await load();
    router.refresh();
    return true;
  };

  const add = async () => {
    if (!picked.length) return;
    if (await call("add", `/api/projects/${projectId}/instances`, { method: "POST", body: JSON.stringify({ orgUnitIds: picked }) })) {
      setPicked([]);
      setAddOpen(false);
    }
  };
  const patch = (orgUnitId: string, body: Record<string, unknown>) => call(orgUnitId, `/api/projects/${projectId}/instances/${orgUnitId}`, { method: "PATCH", body: JSON.stringify(body) });
  const retire = (orgUnitId: string) => call(orgUnitId, `/api/projects/${projectId}/instances/${orgUnitId}`, { method: "DELETE" });

  return (
    <section className={`${CARD} overflow-hidden`} style={CARD_BG} aria-labelledby="instances-title">
      <div className="flex flex-wrap items-center gap-3 p-[12px_16px]">
        <h2 id="instances-title" className="text-[13.5px] font-semibold text-[var(--qink)]">
          {label === "Instance" ? "Instances" : `${label}s`}
        </h2>
        <span className="text-[12px] text-[var(--ink4)]">
          {rows.length === 0 ? `This product ships to no ${plural} yet.` : `${rows.length} · gates, the weekly check-in and the set-up checklist run per ${label.toLowerCase()}`}
        </span>
        {canManage && (
          <button type="button" onClick={() => setAddOpen(true)} className={`${SECONDARY} ml-auto gap-1.5`} disabled={addable.length === 0} title={addable.length === 0 ? `Every ${label.toLowerCase()} is already on this project — add more under Admin › Organisation` : undefined}>
            <Plus className="size-3.5" aria-hidden /> Add {label.toLowerCase()}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-1.5 px-4 pb-2 text-[12px] text-[var(--bad)]">
          <ShieldAlert className="size-3" aria-hidden /> {error}
        </p>
      )}
      {rows.length > 0 && (
        <ol className="border-t border-[var(--hair2)]">
          {rows.map((r) => {
            const s = setups[r.orgUnitId];
            return (
              <li key={r.orgUnitId} className="flex flex-col gap-2 border-b border-[var(--hair2)] p-[12px_16px] last:border-0">
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => onSelect(r.orgUnitId)} className={`rounded-[4px] text-[14px] font-semibold text-[var(--qink)] transition-colors hover:text-brand ${FOCUS}`} title={`Open the workspace scoped to ${r.code}`}>
                    {r.flag ? `${r.flag} ` : ""}
                    {r.name} <span className="font-mono text-[11px] font-semibold text-[var(--ink4)]">{r.code}</span>
                  </button>
                  <span className="flex items-center gap-2 text-[12px] text-[var(--ink3)]" role="img" aria-label={`${r.progress}% of gates`}>
                    <span className="h-1.5 w-[90px] overflow-hidden rounded-full bg-[var(--wash2)]">
                      <span className="block h-full rounded-full" style={{ width: `${r.progress}%`, ...ragFill(r.progress >= 100 ? "Green" : "Amber") }} />
                    </span>
                    <b className="tabular-nums text-[var(--qink)]">{r.progress}%</b>
                  </span>
                  {canManage ? (
                    <select value={r.status} onChange={(e) => void patch(r.orgUnitId, { status: e.target.value })} aria-label={`${r.code} status`} className={INPUT}>
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {STATUS_LABEL[st]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink3)]">{STATUS_LABEL[r.status] ?? r.status}</span>
                  )}
                  {pmScope === "instance" &&
                    (canManage ? (
                      <select value={r.leadUserId ?? ""} onChange={(e) => void patch(r.orgUnitId, { leadUserId: e.target.value || null })} aria-label={`${r.code} lead`} className={`${INPUT} max-w-[200px]`}>
                        <option value="">No lead</option>
                        {people.map((p) => (
                          <option key={p.userId} value={p.userId}>
                            {p.name}
                          </option>
                        ))}
                        {r.leadUserId && !people.some((p) => p.userId === r.leadUserId) && <option value={r.leadUserId}>{r.leadName ?? "Lead"}</option>}
                      </select>
                    ) : (
                      <span className="text-[12px] text-[var(--ink3)]">
                        Lead <b className="text-[var(--qink)]">{r.leadName ?? "—"}</b>
                      </span>
                    ))}
                  {busy === r.orgUnitId && <Loader2 className="size-3.5 animate-spin text-[var(--ink4)]" aria-hidden />}
                  {canManage && (
                    <button type="button" onClick={() => void retire(r.orgUnitId)} className={`${QUIET} ml-auto inline-flex items-center gap-1 text-[var(--ink4)]`} title="Retire — kept for history, hidden everywhere">
                      <X className="size-3" aria-hidden /> Retire
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[var(--ink4)]">
                  {s ? (
                    <span className="flex flex-wrap items-center gap-2" aria-label={`${r.code} set-up ${s.done} of ${s.total}`}>
                      <b className="text-[var(--qink)]">Set up {s.done} of {s.total}</b>
                      {(
                        [
                          ["gates", "Gates"],
                          ["documents", "Documents"],
                          ["lead", "Lead"],
                          ...(s.youtrack === null ? [] : [["youtrack", "YouTrack"]]),
                          ["thisWeek", "This week's check-in"],
                        ] as [keyof Setup, string][]
                      ).map(([k, lbl]) => (
                        <span key={k} className="inline-flex items-center gap-1" style={{ color: s[k] ? "var(--ok)" : "var(--ink5)" }}>
                          {s[k] ? <Check className="size-3" aria-hidden /> : <span className="size-[9px] rounded-full border border-[var(--input)]" aria-hidden />}
                          {lbl}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span>Reading set-up…</span>
                  )}
                  {canManage ? (
                    <input
                      defaultValue={r.note ?? ""}
                      maxLength={300}
                      placeholder="One-line note (go-live date, local partner, …)"
                      aria-label={`${r.code} note`}
                      onBlur={(e) => e.target.value !== (r.note ?? "") && void patch(r.orgUnitId, { note: e.target.value.trim() || null })}
                      className={`${INPUT} h-7 min-w-[220px] flex-1 text-[11.5px]`}
                    />
                  ) : (
                    r.note && <span className="italic text-[var(--ink3)]">“{r.note}”</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add {plural}</DialogTitle>
            <DialogDescription>Each one gets its own gates, weekly check-in and set-up checklist. Missing one? Admin › Organisation holds the list.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {addable.map((u) => {
              const on = picked.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== u.id) : [...p, u.id]))}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors ${FOCUS} ${on ? "border-[var(--qink)] bg-[var(--qink)] text-[var(--qcard)]" : "border-[var(--border)] text-[var(--ink3)] hover:text-[var(--qink)]"}`}
                >
                  {u.flag ? `${u.flag} ` : ""}
                  {u.code} · {u.name}
                </button>
              );
            })}
            {addable.length === 0 && <p className="text-[12.5px] text-[var(--ink4)]">Nothing left to add.</p>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void add()} disabled={busy !== null || picked.length === 0} className={PRIMARY}>
              {busy === "add" ? "Adding…" : `Add ${picked.length || ""}`.trim()}
            </button>
            <button type="button" onClick={() => setAddOpen(false)} className={QUIET}>
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

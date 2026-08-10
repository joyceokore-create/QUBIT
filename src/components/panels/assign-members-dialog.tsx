"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminFormDialog } from "@/components/admin/admin-form-dialog";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { assignmentWarnings } from "@/lib/capacity";
import { PROJECT_ROLES } from "@/lib/roles";

/**
 * M-P1d (docs/26 §4.3) — the capacity-aware assign panel. Bulk pick from the bench
 * (least booked first, leave surfaced), warnings that inform and are audited, and the
 * escape hatch to a resource request.
 *
 * DM1.73 (Wave D) — per-person rows (docs/29's one-panel promise, pragmatic version).
 * The shared role/allocation/window fields are now DEFAULTS: each checked person gets a
 * compact editable row pre-filled from them, so "a PM at 20% and two devs at 60%" is one
 * dialog trip, not three. A row field the user hasn't touched keeps following the
 * defaults (overrides are sparse); an edited field sticks. The server contract is
 * unchanged — POST /api/projects/:id/members already takes per-member
 * role/allocationPct/startDate/endDate; we just stop sending the same values N times.
 */

interface BenchRow {
  userId: string;
  name: string;
  totalPct: number;
  awayDaysInWindow: number;
}

/** Per-row values; every field optional — absent means "follow the shared default". */
type RowOverride = Partial<{ role: string; alloc: number; start: string; end: string }>;

const LABEL = "text-[11px] font-semibold tracking-[0.6px] text-[var(--ink4)] uppercase";
const ROW_FIELD = "h-8 rounded-lg border border-input bg-background px-2 text-[12px]";

export function AssignMembersDialog({
  projectId,
  existingUserIds,
  onDone,
}: {
  projectId: string;
  existingUserIds: string[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [bench, setBench] = useState<BenchRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<string>("Developer");
  const [alloc, setAlloc] = useState(50);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  // DM1.73 (Wave D) — sparse per-person overrides on top of the shared defaults.
  const [overrides, setOverrides] = useState<Record<string, RowOverride>>({});
  const { busy, error, setError, mutate } = useAdminMutation();

  useEffect(() => {
    if (!open) return;
    const qs = new URLSearchParams();
    if (start) qs.set("start", new Date(start).toISOString());
    if (end) qs.set("end", new Date(end).toISOString());
    fetch(`/api/staffing/bench?${qs}`)
      .then((r) => r.json())
      .then((d) => setBench((d.data ?? []) as BenchRow[]))
      .catch(() => setBench([]));
  }, [open, start, end]);

  const candidates = useMemo(
    () => bench.filter((b) => !existingUserIds.includes(b.userId)),
    [bench, existingUserIds],
  );

  /** Effective values for one person: their overrides, falling back to the defaults. */
  const rowValues = (userId: string) => {
    const o = overrides[userId] ?? {};
    return { role: o.role ?? role, alloc: o.alloc ?? alloc, start: o.start ?? start, end: o.end ?? end };
  };

  const setRowField = (userId: string, patch: RowOverride) =>
    setOverrides((prev) => ({ ...prev, [userId]: { ...prev[userId], ...patch } }));

  // DM1.73 — the shared capacity implementation (src/lib/capacity.ts) replaces the
  // hand-rolled copy that used to live here and in the project wizard. Wave D: computed
  // per ROW (each person's own alloc/window), keyed by user so warnings render inline;
  // the flat aggregate is what rides to the server as acceptedWarnings, same as before.
  const warningsByUser = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const c of candidates) {
      if (!picked.has(c.userId)) continue;
      const v = rowValues(c.userId);
      const w = assignmentWarnings(c, v.alloc, { start: v.start || null, end: v.end || null });
      if (w.length) out.set(c.userId, w);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, picked, overrides, role, alloc, start, end]);
  const warnings = useMemo(() => [...warningsByUser.values()].flat(), [warningsByUser]);

  const selected = useMemo(() => candidates.filter((c) => picked.has(c.userId)), [candidates, picked]);

  async function submit() {
    if (picked.size === 0) {
      setError("Pick at least one person.");
      return;
    }
    await mutate(
      `/api/projects/${projectId}/members`,
      "POST",
      {
        // Same shape as before (BulkAddMembersInput) — per-person values instead of
        // one shared set repeated.
        members: [...picked].map((userId) => {
          const v = rowValues(userId);
          return {
            userId,
            role: v.role,
            allocationPct: v.alloc,
            startDate: v.start ? new Date(v.start).toISOString() : undefined,
            endDate: v.end ? new Date(v.end).toISOString() : undefined,
          };
        }),
        acceptedWarnings: warnings,
      },
      {
        fallback: "Could not assign.",
        onSuccess: () => {
          setOpen(false);
          setPicked(new Set());
          setOverrides({});
          onDone();
        },
      },
    );
  }

  return (
    <AdminFormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
      title="Add to team"
      description="An assignment is person + role hat + allocation + dates — never a bare membership row."
      error={error}
      busy={busy}
      submitLabel={picked.size > 1 ? `Assign ${picked.size} people` : "Assign"}
      onSubmit={submit}
      className="sm:max-w-[640px]"
      trigger={
        <DialogTrigger render={<Button size="sm" />}>
          <Plus /> Add member
        </DialogTrigger>
      }
    >
      <div className="flex max-h-[62vh] flex-col gap-3 overflow-y-auto pr-0.5">
        <div className="max-h-[180px] flex-none overflow-auto rounded-[10px] border border-[var(--w08)]">
          {candidates.length === 0 ? (
            <p className="p-3 text-[12px] text-[var(--ink4)]">Everyone is already on this project.</p>
          ) : (
            candidates.map((c) => {
              const on = picked.has(c.userId);
              return (
                <button
                  key={c.userId}
                  type="button"
                  onClick={() => {
                    const next = new Set(picked);
                    if (on) {
                      next.delete(c.userId);
                      // Dropping a person drops their edits — re-picking starts from the defaults.
                      setOverrides((prev) => {
                        const { [c.userId]: _gone, ...rest } = prev;
                        return rest;
                      });
                    } else next.add(c.userId);
                    setPicked(next);
                  }}
                  className="flex w-full items-center gap-2.5 border-b border-[var(--w06)] px-3 py-2 text-left text-[12.5px] last:border-0 hover:bg-[var(--wash2)]"
                >
                  <span aria-hidden>{on ? "☑" : "☐"}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--qink)]">{c.name}</span>
                  <span className="text-[11px] text-[var(--ink4)]">{c.totalPct}% booked</span>
                  {c.awayDaysInWindow > 0 ? (
                    <span className="rounded-full bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--warn)]">
                      {c.awayDaysInWindow}d leave
                    </span>
                  ) : (
                    <span className="rounded-full bg-[color-mix(in_oklab,var(--ok)_10%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ok)]">
                      available
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={LABEL}>Default role hat · drives board lens & report routing</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
              {PROJECT_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <span className={LABEL}>Default allocation %</span>
            <Input
              type="number"
              min={1}
              max={100}
              value={alloc}
              onChange={(e) => setAlloc(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="mt-1.5"
            />
          </div>
          <div>
            <span className={LABEL}>Default start</span>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <span className={LABEL}>Default end</span>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1.5" />
          </div>
        </div>

        {/* DM1.73 (Wave D) — one compact row per selected person, pre-filled from the
            defaults above and individually editable. Untouched fields keep tracking the
            defaults; edited ones stick. */}
        {selected.length > 0 && (
          <div className="rounded-[10px] border border-[var(--w08)]">
            <div className="border-b border-[var(--w06)] px-3 py-1.5">
              <span className={LABEL}>Per-person assignment ({selected.length})</span>
            </div>
            {selected.map((c) => {
              const v = rowValues(c.userId);
              const rowWarnings = warningsByUser.get(c.userId) ?? [];
              return (
                <div key={c.userId} className="border-b border-[var(--w06)] px-3 py-2 last:border-0">
                  <div className="grid grid-cols-[minmax(0,1fr)_130px_64px_118px_118px] items-center gap-2">
                    <span className="min-w-0 truncate text-[12.5px] font-medium text-[var(--qink)]" title={c.name}>
                      {c.name}
                    </span>
                    <select
                      value={v.role}
                      onChange={(e) => setRowField(c.userId, { role: e.target.value })}
                      aria-label={`Role for ${c.name}`}
                      className={`${ROW_FIELD} w-full`}
                    >
                      {PROJECT_ROLES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={v.alloc}
                      onChange={(e) => setRowField(c.userId, { alloc: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                      aria-label={`Allocation % for ${c.name}`}
                      className={`${ROW_FIELD} w-full tabular-nums`}
                    />
                    <input
                      type="date"
                      value={v.start}
                      onChange={(e) => setRowField(c.userId, { start: e.target.value })}
                      aria-label={`Start date for ${c.name}`}
                      className={`${ROW_FIELD} w-full`}
                    />
                    <input
                      type="date"
                      value={v.end}
                      onChange={(e) => setRowField(c.userId, { end: e.target.value })}
                      aria-label={`End date for ${c.name}`}
                      className={`${ROW_FIELD} w-full`}
                    />
                  </div>
                  {rowWarnings.length > 0 && (
                    <p className="mt-1 text-[11px] text-[var(--warn)]">⚠ {rowWarnings.join("; ")}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {warnings.length > 0 && (
          <p className="rounded-[8px] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] px-3 py-2 text-[11.5px] text-[var(--warn)]">
            ⚠ Assigning accepts the {warnings.length === 1 ? "warning" : `${warnings.length} warnings`} above (recorded in the audit trail).
          </p>
        )}

        <Link href="/people?tab=requests" className="text-[11.5px] text-[var(--ink4)] underline-offset-2 hover:underline">
          Can&apos;t find capacity? Raise a resource request →
        </Link>
      </div>
    </AdminFormDialog>
  );
}

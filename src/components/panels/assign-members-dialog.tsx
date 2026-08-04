"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminFormDialog } from "@/components/admin/admin-form-dialog";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PROJECT_ROLES } from "@/lib/roles";

/**
 * M-P1d (docs/26 §4.3) — the capacity-aware assign panel. Bulk pick from the bench
 * (least booked first, leave surfaced), one shared role hat + allocation + window,
 * warnings that inform and are audited, and the escape hatch to a resource request.
 */

interface BenchRow {
  userId: string;
  name: string;
  totalPct: number;
  awayDaysInWindow: number;
}

const LABEL = "text-[11px] font-semibold tracking-[0.6px] text-[var(--ink4)] uppercase";

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

  const warnings = useMemo(() => {
    const out: string[] = [];
    for (const c of candidates) {
      if (!picked.has(c.userId)) continue;
      const projected = c.totalPct + alloc;
      if (projected > 100) out.push(`${c.name} would be at ${projected}% (over-allocated)`);
      if (c.awayDaysInWindow > 0) out.push(`${c.name} has ${c.awayDaysInWindow}d of leave in this window`);
    }
    return out;
  }, [candidates, picked, alloc]);

  async function submit() {
    if (picked.size === 0) {
      setError("Pick at least one person.");
      return;
    }
    await mutate(
      `/api/projects/${projectId}/members`,
      "POST",
      {
        members: [...picked].map((userId) => ({
          userId,
          role,
          allocationPct: alloc,
          startDate: start ? new Date(start).toISOString() : undefined,
          endDate: end ? new Date(end).toISOString() : undefined,
        })),
        acceptedWarnings: warnings,
      },
      {
        fallback: "Could not assign.",
        onSuccess: () => {
          setOpen(false);
          setPicked(new Set());
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
      className="sm:max-w-[560px]"
      trigger={
        <DialogTrigger render={<Button size="sm" />}>
          <Plus /> Add member
        </DialogTrigger>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="max-h-[220px] overflow-auto rounded-[10px] border border-[var(--w08)]">
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
                    if (on) next.delete(c.userId);
                    else next.add(c.userId);
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
            <span className={LABEL}>Role hat · drives board lens & report routing</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
              {PROJECT_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <span className={LABEL}>Allocation %</span>
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
            <span className={LABEL}>Start</span>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <span className={LABEL}>End</span>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1.5" />
          </div>
        </div>

        {warnings.length > 0 && (
          <p className="rounded-[8px] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] px-3 py-2 text-[11.5px] text-[var(--warn)]">
            ⚠ {warnings.join("; ")} — assigning accepts this (recorded in the audit trail).
          </p>
        )}

        <Link href="/staffing" className="text-[11.5px] text-[var(--ink4)] underline-offset-2 hover:underline">
          Can&apos;t find capacity? Raise a resource request →
        </Link>
      </div>
    </AdminFormDialog>
  );
}

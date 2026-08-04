"use client";

import { useEffect, useState } from "react";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PROJECT_ROLES } from "@/lib/roles";

interface RequestRow {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  raisedById: string;
  raisedByName: string;
  role: string;
  allocationPct: number;
  windowStart: string;
  windowEnd: string;
  note: string | null;
  status: string;
  resolvedNote: string | null;
  filledName: string | null;
  createdAt: string;
}
interface ProjectOpt {
  id: string;
  code: string;
  name: string;
}
interface BenchRow {
  userId: string;
  name: string;
  totalPct: number;
  awayDaysInWindow: number;
}

const LABEL = "text-[11px] font-semibold tracking-[0.6px] text-[var(--ink4)] uppercase";
const SELECT = "mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function StaffingClient({
  isHead,
  viewerId,
  projects,
  requests,
}: {
  isHead: boolean;
  viewerId: string;
  projects: ProjectOpt[];
  requests: RequestRow[];
}) {
  const { busy, error, setError, mutate } = useAdminMutation();

  // Raise form (PMs and Heads alike — a Head can ask on a project's behalf too).
  const [projectId, setProjectId] = useState("");
  const [role, setRole] = useState("QA Engineer");
  const [alloc, setAlloc] = useState(60);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");

  // Head: which request's bench is open, and the decline-reason editor.
  const [benchFor, setBenchFor] = useState<RequestRow | null>(null);
  const [bench, setBench] = useState<BenchRow[]>([]);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!benchFor) return;
    const qs = new URLSearchParams({ start: benchFor.windowStart, end: benchFor.windowEnd });
    fetch(`/api/staffing/bench?${qs}`)
      .then((r) => r.json())
      .then((d) => setBench((d.data ?? []) as BenchRow[]))
      .catch(() => setBench([]));
  }, [benchFor]);

  async function raise() {
    if (!projectId || !start || !end) {
      setError("Project and window are required.");
      return;
    }
    await mutate(
      "/api/staffing/requests",
      "POST",
      {
        projectId,
        role,
        allocationPct: alloc,
        windowStart: new Date(start).toISOString(),
        windowEnd: new Date(end).toISOString(),
        note: note.trim() || undefined,
      },
      { fallback: "Could not raise the request." },
    );
  }

  const resolve = (id: string, body: Record<string, unknown>) =>
    mutate(`/api/staffing/requests/${id}`, "POST", body, {
      fallback: "Could not resolve the request.",
      onSuccess: () => {
        setBenchFor(null);
        setDecliningId(null);
        setReason("");
      },
    });

  return (
    <div className="flex flex-col gap-5">
      {projects.length > 0 && (
        <div className="rounded-[14px] border border-[var(--w08)] bg-[var(--qcard)] p-4">
          <p className="text-[13px] font-bold text-[var(--qink)]">New request</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <span className={LABEL}>Project</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={SELECT}>
                <option value="">— pick —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={LABEL}>Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={SELECT}>
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
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={LABEL}>From</span>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <span className={LABEL}>To</span>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1.5" />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <span className={LABEL}>Why (optional)</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5" placeholder="e.g. UAT regression pack needs a second QA" />
          </div>
          {error && (
            <p role="alert" className="mt-2 text-[12.5px] text-status-red">
              {error}
            </p>
          )}
          <Button type="button" onClick={() => void raise()} disabled={busy} className="mt-3">
            {busy ? "Sending…" : "Send to Head of PMs"}
          </Button>
        </div>
      )}

      <div className="rounded-[14px] border border-[var(--w08)] bg-[var(--qcard)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--w08)] text-left">
              {["Request", "Project", "Raised by", "Status", ""].map((h) => (
                <th key={h} className="px-3.5 py-2.5 text-[10px] font-semibold tracking-[0.8px] text-[var(--ink4)] uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3.5 py-6 text-center text-[12px] text-[var(--ink4)]">
                  No requests yet.
                </td>
              </tr>
            )}
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-[var(--w06)] last:border-0">
                <td className="px-3.5 py-2.5">
                  <span className="font-semibold text-[var(--qink)]">
                    1 {r.role} · {r.allocationPct}% · {fmt(r.windowStart)}–{fmt(r.windowEnd)}
                  </span>
                  {r.note && <div className="text-[11px] text-[var(--ink4)]">{r.note}</div>}
                </td>
                <td className="px-3.5 py-2.5 text-[var(--ink3)]">{r.projectCode}</td>
                <td className="px-3.5 py-2.5 text-[var(--ink3)]">{r.raisedByName}</td>
                <td className="px-3.5 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                      r.status === "Open"
                        ? "bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] text-[var(--warn)]"
                        : r.status === "Filled"
                          ? "bg-[color-mix(in_oklab,var(--ok)_10%,transparent)] text-[var(--ok)]"
                          : r.status === "Cancelled"
                          ? "bg-[var(--wash2)] text-[var(--ink4)]"
                          : "bg-[color-mix(in_oklab,var(--bad)_10%,transparent)] text-[var(--bad)]"
                    }`}
                  >
                    {r.status === "Filled" && r.filledName ? `Filled — ${r.filledName}` : r.status}
                    {(r.status === "Declined" || r.status === "Cancelled") && r.resolvedNote ? ` — ${r.resolvedNote}` : ""}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  {r.status === "Open" && (
                    <span className="inline-flex gap-1.5">
                      {isHead && (
                        <>
                          <Button size="sm" onClick={() => setBenchFor(benchFor?.id === r.id ? null : r)}>
                            Fill from bench
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDecliningId(decliningId === r.id ? null : r.id)}>
                            Decline
                          </Button>
                        </>
                      )}
                      {(isHead || r.raisedById === viewerId) && (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void resolve(r.id, { action: "cancel" })}>
                          Cancel
                        </Button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {benchFor && (
        <div className="rounded-[14px] border border-[var(--w08)] bg-[var(--qcard)] p-4">
          <p className="text-[13px] font-bold text-[var(--qink)]">
            Bench — for 1 {benchFor.role} · {benchFor.allocationPct}% · {fmt(benchFor.windowStart)}–{fmt(benchFor.windowEnd)} on {benchFor.projectCode}
          </p>
          <p className="text-[11px] text-[var(--ink4)]">Least booked first · leave inside the window surfaced.</p>
          <div className="mt-2.5 flex flex-col">
            {bench.map((b) => (
              <div key={b.userId} className="flex items-center gap-3 border-b border-[var(--w06)] py-2 last:border-0">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--qink)]">{b.name}</span>
                <span className="text-[11px] text-[var(--ink4)]">{b.totalPct}% booked</span>
                {b.awayDaysInWindow > 0 && (
                  <span className="rounded-full bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--warn)]">
                    {b.awayDaysInWindow}d leave in window
                  </span>
                )}
                <Button size="sm" disabled={busy} onClick={() => void resolve(benchFor.id, { action: "fill", userId: b.userId })}>
                  Assign →
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {decliningId && (
        <div className="rounded-[14px] border border-[var(--w08)] bg-[var(--qcard)] p-4">
          <p className="text-[13px] font-bold text-[var(--qink)]">Decline — a reason is required</p>
          <div className="mt-2 flex gap-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. no QA bench until September" />
            <Button
              variant="destructive"
              disabled={busy || reason.trim().length < 3}
              onClick={() => void resolve(decliningId, { action: "decline", reason: reason.trim() })}
            >
              Decline
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

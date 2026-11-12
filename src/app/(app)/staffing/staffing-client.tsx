"use client";

import { useEffect, useState } from "react";
import { RaiseRequestFormSchema, DeclineFormSchema } from "@/lib/staffing-schema";
import { FIELD_INVALID } from "@/lib/surface";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/drawer";
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
// DM1.73 — sensible default ask window: today → +8 weeks (a typical staffing horizon).
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const defaultStart = () => isoDay(Date.now());
const defaultEnd = () => isoDay(Date.now() + 56 * 86_400_000);

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
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [note, setNote] = useState("");
  // DM1.73 — brief inline confirmation after a successful raise.
  const [sent, setSent] = useState(false);
  // docs/08 § Errors: problems show on their field; the buttons stay enabled except while sending.
  const fe = useFieldErrors({ schema: RaiseRequestFormSchema, values: { projectId, windowStart: start, windowEnd: end, note }, idPrefix: "staffing" });

  // Head: which request's bench is open, and the decline-reason editor.
  const [benchFor, setBenchFor] = useState<RequestRow | null>(null);
  const [bench, setBench] = useState<BenchRow[]>([]);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const declineFe = useFieldErrors({ schema: DeclineFormSchema, values: { reason }, idPrefix: "decline" });

  useEffect(() => {
    if (!benchFor) return;
    // DM1.73 — role activates benchFor's role-fit soft sort (docs/29 §3).
    const qs = new URLSearchParams({ start: benchFor.windowStart, end: benchFor.windowEnd, role: benchFor.role });
    fetch(`/api/staffing/bench?${qs}`)
      .then((r) => r.json())
      .then((d) => setBench((d.data ?? []) as BenchRow[]))
      .catch(() => setBench([]));
  }, [benchFor]);

  async function raise() {
    setError(null);
    if (!fe.validate(["projectId", "windowStart", "windowEnd", "note"])) return;
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
      {
        fallback: "Could not raise the request.",
        onFieldErrors: (f) => fe.setServerErrors(f, ["projectId", "windowStart", "windowEnd", "note"]),
        // DM1.73 — clear the form and confirm inline; the refreshed queue below is the
        // real receipt, the banner just points at it.
        onSuccess: () => {
          setProjectId("");
          setNote("");
          fe.reset();
          setStart(defaultStart());
          setEnd(defaultEnd());
          setSent(true);
          window.setTimeout(() => setSent(false), 5000);
        },
      },
    );
  }

  const resolve = (id: string, body: Record<string, unknown>) =>
    mutate(`/api/staffing/requests/${id}`, "POST", body, {
      fallback: "Could not resolve the request.",
      onSuccess: () => {
        setBenchFor(null);
        setDecliningId(null);
        setReason("");
        declineFe.reset();
      },
      onFieldErrors: (f) => declineFe.setServerErrors(f),
    });

  return (
    <div className="flex flex-col gap-5">
      {projects.length > 0 && (
        <div className="rounded-[14px] border border-[var(--w08)] bg-[var(--qcard)] p-4">
          <p className="text-[13px] font-bold text-[var(--qink)]">New request</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <label htmlFor={fe.idOf("projectId")} className={LABEL}>Project</label>
              <select {...fe.bind("projectId")} value={projectId} onChange={(e) => setProjectId(e.target.value)} className={`${SELECT} ${FIELD_INVALID}`}>
                <option value="">— pick —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
              {fe.errors.projectId && <div className="mt-1.5"><FieldError id={`${fe.idOf("projectId")}-error`}>{fe.errors.projectId}</FieldError></div>}
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
                <label htmlFor={fe.idOf("windowStart")} className={LABEL}>From</label>
                <Input {...fe.bind("windowStart")} type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1.5" />
                {fe.errors.windowStart && <div className="mt-1.5"><FieldError id={`${fe.idOf("windowStart")}-error`}>{fe.errors.windowStart}</FieldError></div>}
              </div>
              <div>
                <label htmlFor={fe.idOf("windowEnd")} className={LABEL}>To</label>
                <Input {...fe.bind("windowEnd")} type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1.5" />
                {fe.errors.windowEnd && <div className="mt-1.5"><FieldError id={`${fe.idOf("windowEnd")}-error`}>{fe.errors.windowEnd}</FieldError></div>}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor={fe.idOf("note")} className={LABEL}>Why (optional)</label>
            <Input {...fe.bind("note")} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5" placeholder="e.g. UAT regression pack needs a second QA" />
            {fe.errors.note && <div className="mt-1.5"><FieldError id={`${fe.idOf("note")}-error`}>{fe.errors.note}</FieldError></div>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void raise()} disabled={busy}>
              {busy ? "Sending…" : "Send to Head"}
            </Button>
            {error && !decliningId && (
              <p role="alert" className="text-[12.5px] text-status-red">
                {error}
              </p>
            )}
            {sent && (
              <p role="status" className="text-[12.5px] font-semibold text-[var(--ok)]">
                Request sent — it&apos;s in the queue below.
              </p>
            )}
          </div>
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
                          <Button size="sm" variant="outline" onClick={() => {
                            declineFe.reset();
                            setError(null);
                            setDecliningId(decliningId === r.id ? null : r.id);
                          }}>
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
          <p className="text-[11px] text-[var(--ink4)]">
            People who have worn the {benchFor.role} hat first, then least booked · leave inside the window surfaced.
          </p>
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
          <div className="mt-2 flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Input {...declineFe.bind("reason")} aria-label="Reason for declining" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. no QA bench until September" />
              {declineFe.errors.reason && <FieldError id={`${declineFe.idOf("reason")}-error`}>{declineFe.errors.reason}</FieldError>}
            </div>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (!declineFe.validate()) return;
                void resolve(decliningId, { action: "decline", reason: reason.trim() });
              }}
            >
              Decline
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-[12.5px] text-status-red">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

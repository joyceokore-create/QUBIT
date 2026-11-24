"use client";

import { dispatchTourEvent } from "@/components/tour/tour-events";
import { checkInFormSchema } from "@/lib/checkin-schema";
import { readApiError } from "@/lib/form-errors";
import { useFieldErrors } from "@/components/forms/use-field-errors";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Send, Upload } from "lucide-react";
import { toast } from "sonner";
import { LocalTime } from "@/components/reports/local-time";
import { lineTone, type LineTone } from "@/lib/status-lines";
import { COMPACT, COMPACT_PRIMARY, FOCUS, PRIMARY, SECONDARY, THEAD, TROW } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { FilterChips, FilterSelect, ListToolbar, SearchField } from "@/components/list/list-toolbar";
import { InHeaderSlot } from "@/components/list/header-slot";
import { PM_WEEK_HEADER_SLOT } from "@/lib/header-slots";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { Panel } from "@/components/ui/panel";
import { Chip, HealthPill } from "@/components/ui/status-pill";
import { TEXT_LINK, TextLink } from "@/components/ui/text-link";
import { Choice, Drawer, DrawerError, DrawerFooter, DrawerFrame, DrawerHeader, DrawerSection, DrawerText, Field, FIELD_INPUT, FIELD_TEXTAREA } from "@/components/ui/drawer";
import { matchesSearch, paginate } from "@/lib/list-state";
import type { Rag } from "@/server/health";

/**
 * Milestone B — the PM's week on /reports › This Week (design spec v2: toolbar above a table
 * card — Project · Status · Line for the Head · Update). Every project you run, its line and
 * whether it reached the Head. "Review & Send" opens the update in the shared drawer:
 * confirming IS sending (Milestone A). Sent rows sink to the bottom as the queue drains.
 * "Confirm & Send All" sends every drafted line in one go; "Update All My Projects" opens
 * the weekly update workspace (cards + status report upload).
 */

export interface PmRowJson {
  projectId: string;
  code: string;
  name: string;
  portfolioName: string;
  status: "Draft" | "Confirmed" | "None";
  computedRag: Rag;
  effectiveRag: Rag;
  narrative: string | null;
  ragOverride: Rag | null;
  overrideReason: string | null;
  draftLines: string[];
  confirmed: boolean;
  sentToHead: boolean;
  sentAt: string | null;
  canConfirm: boolean;
  /** docs/38 — products with markets: how many of them checked in this week. */
  marketsTotal: number;
  marketsCheckedIn: number;
}

const RAGS = ["Green", "Amber", "Red"] as const;
const RAG_WORD: Record<Rag, string> = { Green: "On track", Amber: "At risk", Red: "Off track" };
const RAG_TONE: Record<Rag, "ok" | "warn" | "bad"> = { Green: "ok", Amber: "warn", Red: "bad" };
const LINE_DOT: Record<LineTone, string> = { bad: "var(--ds-bad)", warn: "var(--ds-warn)", ok: "var(--ds-ok)", neutral: "var(--ds-ink4)" };
const RANK: Record<Rag, number> = { Red: 0, Amber: 1, Green: 2 };
const stage = (r: PmRowJson) => (!r.confirmed ? 0 : !r.sentToHead ? 1 : 2);
const sortRows = (rows: PmRowJson[]) =>
  [...rows].sort((a, b) => stage(a) - stage(b) || RANK[a.effectiveRag] - RANK[b.effectiveRag] || a.name.localeCompare(b.name));
const workspaceOf = (r: PmRowJson) => `/projects/${r.projectId}?tab=This%20week`;

export function PmWeek({ isCurrent, rows: initial, canUpload = false }: { isoWeek: string; isCurrent: boolean; rows: PmRowJson[]; canUpload?: boolean }) {
  const [rows, setRows] = useState<PmRowJson[]>(() => sortRows(initial));
  const [sendingAll, setSendingAll] = useState<{ done: number; total: number } | null>(null);
  const [sendAllErrors, setSendAllErrors] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  // The server re-renders after an upload fills the drafts (router.refresh) — the queue
  // must follow, or the filled lines never show without a hard reload.
  useEffect(() => {
    setRows(sortRows(initial));
  }, [initial]);

  const onChange = (next: PmRowJson) => setRows((prev) => sortRows(prev.map((p) => (p.projectId === next.projectId ? next : p))));

  const list = useListUrl("pm-week", 10); // before the early return (rules of hooks)

  if (rows.length === 0) {
    return (
      <div data-tour="pm-week">
        <Panel>
          <ListEmpty filtered={false} noun="projects this week" hint="You don't lead any projects this week. Your work is reported from the board." action={<TextLink href="/board">Open My Board</TextLink>} />
        </Panel>
      </div>
    );
  }

  const sent = rows.filter((r) => r.sentToHead).length;
  const toSend = rows.length - sent;

  // Rows a bulk send can take as they are: drafted narrative, confirmable, not yet sent.
  const sendable = rows.filter((r) => isCurrent && r.canConfirm && !r.confirmed && (r.narrative ?? "").trim());
  const anyConfirmable = isCurrent && rows.some((r) => r.canConfirm);

  // UX12 (L1–L3, D13): the list rules — search, a Status filter, always-visible pagination
  // (default 10, remembered). "pw*" keys so they never clash with /reports' own params.
  const statusFilter = list.get("pwstatus");
  const shown = rows.filter((r) => matchesSearch(list.q, r.name, r.code) && (!statusFilter || (statusFilter === "sent" ? r.sentToHead : !r.sentToHead)));
  const { rows: pageRows, info } = paginate(shown, list.page, list.size);
  const filtersOn = !!statusFilter || !!list.q;
  const openRow = openId ? (rows.find((r) => r.projectId === openId) ?? null) : null;

  const sendAll = async () => {
    setSendingAll({ done: 0, total: sendable.length });
    setSendAllErrors([]);
    const errors: string[] = [];
    let done = 0;
    for (const r of sendable) {
      // The saved draft already holds any override + reason; the queue's one action re-sends them.
      const res = await fetch(`/api/projects/${r.projectId}/checkin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          narrative: (r.narrative ?? "").trim(),
          ...(r.ragOverride && r.ragOverride !== r.computedRag ? { ragOverride: r.ragOverride, overrideReason: r.overrideReason ?? "From the uploaded status report" } : {}),
        }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.data) {
        onChange({ ...r, confirmed: true, status: "Confirmed", sentToHead: Boolean(d.data.submittedToHeadAt), sentAt: d.data.submittedToHeadAt ?? null, narrative: d.data.narrative ?? r.narrative, effectiveRag: d.data.effectiveRag ?? r.effectiveRag });
      } else {
        errors.push(`${r.code}: ${d?.error?.message ?? "could not send"}`);
      }
      done++;
      setSendingAll({ done, total: sendable.length });
    }
    setSendAllErrors(errors);
    setSendingAll(null);
  };

  /** A week confirmed before the one-step change: send it on as it is. */
  const resend = async (r: PmRowJson) => {
    setResending(r.projectId);
    setRowError(null);
    const res = await fetch(`/api/projects/${r.projectId}/checkin/submit`, { method: "POST" });
    setResending(null);
    const d = await res.json().catch(() => null);
    if (res.ok && d?.data?.submittedToHeadAt) onChange({ ...r, sentToHead: true, sentAt: d.data.submittedToHeadAt });
    else setRowError({ id: r.projectId, message: d?.error?.message ?? "Could not send. Try again." });
  };

  return (
    <div data-tour="pm-week" className="flex flex-col gap-4">
      <h2 className="sr-only">This week&apos;s updates</h2>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(v) => list.set({ q: v })} placeholder="Search your projects or codes" label="Search this week's updates" />
          <FilterSelect
            label="Status"
            allLabel="All statuses"
            value={statusFilter}
            options={[
              { value: "tosend", label: "To send" },
              { value: "sent", label: "Sent" },
            ]}
            onChange={(v) => list.set({ pwstatus: v })}
          />
          <FilterChips filters={statusFilter ? [{ key: "pwstatus", label: `Status: ${statusFilter === "sent" ? "Sent" : "To send"}` }] : []} onRemove={(k) => list.set({ [k]: null })} onClearAll={() => list.clear(["pwstatus"])} />
        </ListToolbar>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto" data-tour="pm-week-actions">
          <span className="text-[12px] tabular-nums text-[var(--ds-ink3)]" aria-label="Weekly reporting progress">
            {sent} of {rows.length} sent{!isCurrent ? " · week closed" : toSend > 0 ? ` · ${toSend} to send before Fri 17:00` : " · the Head has this week"}
          </span>
          {canUpload && isCurrent && (
            <Link href="/reports/update" className={SECONDARY} title="Every project you run on one page: gates, channel states, market check-ins and the line, or prefill it from a status report">
              <Upload className="size-3.5" aria-hidden /> Update All My Projects
            </Link>
          )}
          {anyConfirmable && (
            // UX fidelity Tier 3: the page's one primary lives in the Reports header (design).
            <InHeaderSlot id={PM_WEEK_HEADER_SLOT}>
              <button type="button" onClick={() => void sendAll()} disabled={sendingAll !== null || sendable.length === 0} className={PRIMARY} title={sendable.length ? `Sends ${sendable.length} drafted ${sendable.length === 1 ? "line" : "lines"} to the Head` : "No drafted line is waiting to send"}>
                <Send className="size-3.5" aria-hidden /> {sendingAll ? `Sending ${Math.min(sendingAll.done + 1, sendingAll.total)} of ${sendingAll.total}…` : "Confirm & Send All"}
              </button>
            </InHeaderSlot>
          )}
        </div>
      </div>
      {sendAllErrors.length > 0 && (
        <p role="alert" className="text-[12.5px] font-semibold text-[var(--ds-bad-text)]">
          {sendAllErrors.join(" · ")}
        </p>
      )}

      <TableCard footer={<TableFooter info={info} noun="projects" onPage={list.setPage} onSize={list.setSize} />}>
        {pageRows.length === 0 ? (
          <ListEmpty filtered={filtersOn} noun="projects" onClear={() => list.clear(["pwstatus"])} hint={filtersOn ? undefined : "Projects you run appear here each week, drafted from the board and the markets."} />
        ) : (
          <table className="w-full min-w-[680px] border-separate border-spacing-0 text-[12.5px]">
            <thead className={THEAD}>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Status</th>
                <th scope="col">Line for the Head</th>
                <th scope="col">Update</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const legacyUnsent = r.confirmed && !r.sentToHead;
                const editable = r.canConfirm && isCurrent;
                return (
                  <tr key={r.projectId} className={TROW}>
                    <td className="max-w-[240px]">
                      <Link href={workspaceOf(r)} className={cn("block truncate rounded-[4px] text-[13px] font-semibold text-[var(--ds-ink)] hover:text-[var(--ds-brand-ink)]", FOCUS)}>
                        {r.name}
                      </Link>
                      <span className="block truncate text-[12px] text-[var(--ds-ink3)]">
                        {r.code} · {r.portfolioName}
                      </span>
                    </td>
                    <td>
                      <HealthPill value={r.confirmed ? r.effectiveRag : (r.ragOverride ?? r.effectiveRag)} />
                    </td>
                    <td className="max-w-[420px]">
                      <span className="line-clamp-2 text-[var(--ds-ink2)]">{r.narrative ? r.narrative : <span className="text-[var(--ds-ink3)]">{isCurrent && r.canConfirm ? `Drafted: ${r.draftLines[0] ?? "no activity drafted yet"}` : "No line"}</span>}</span>
                      {!r.canConfirm && isCurrent && !r.confirmed && <span className="block text-[11.5px] text-[var(--ds-ink3)]">Read-only: you don&apos;t run this project.</span>}
                      {rowError?.id === r.projectId && (
                        <span role="alert" className="block text-[11.5px] font-semibold text-[var(--ds-bad-text)]">
                          {rowError.message}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <UpdateChip r={r} isCurrent={isCurrent} />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {editable && legacyUnsent ? (
                        <button type="button" onClick={() => void resend(r)} disabled={resending !== null} className={COMPACT_PRIMARY}>
                          {resending === r.projectId ? "Sending…" : "Send to Head"}
                        </button>
                      ) : editable ? (
                        <button type="button" onClick={() => setOpenId(r.projectId)} className={COMPACT}>
                          {r.sentToHead ? "Edit & Resend" : "Review & Send"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>

      <Drawer open={openRow !== null} onClose={() => setOpenId(null)}>
        {openRow && (
          <PmUpdateForm
            // Re-seed the editor when the server hands us a different draft (an upload filled it).
            key={`${openRow.projectId}:${openRow.status}:${openRow.narrative ?? ""}:${openRow.ragOverride ?? ""}`}
            row={openRow}
            onSent={(next) => {
              onChange(next);
              setOpenId(null);
              toast.success(`${next.name}: ${next.sentToHead ? "sent to the Head" : "confirmed"}`);
            }}
            onCancel={() => setOpenId(null)}
          />
        )}
      </Drawer>
    </div>
  );
}

/** Update column: Sent (with when) · Draft · Not sent. */
function UpdateChip({ r, isCurrent }: { r: PmRowJson; isCurrent: boolean }) {
  if (r.sentToHead)
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <Chip tone="ok">Sent</Chip>
        {r.sentAt && (
          <span className="text-[11.5px] tabular-nums text-[var(--ds-ink3)]">
            <LocalTime iso={r.sentAt} format="weekday-time" />
          </span>
        )}
      </span>
    );
  if (!r.confirmed && r.status === "Draft" && (r.narrative ?? "").trim()) return <Chip tone="info">Draft</Chip>;
  return <Chip tone={isCurrent ? "warn" : "muted"}>Not sent</Chip>;
}

/** Review & Send — the update in the shared drawer: status, the line, why it differs. */
function PmUpdateForm({ row: r, onSent, onCancel }: { row: PmRowJson; onSent: (r: PmRowJson) => void; onCancel: () => void }) {
  const [narrative, setNarrative] = useState(r.narrative ?? r.draftLines[0] ?? "");
  const [rag, setRag] = useState<Rag>(r.ragOverride ?? r.effectiveRag);
  const [reason, setReason] = useState(r.overrideReason ?? "");
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composed, setComposed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const overridden = rag !== r.computedRag;
  // docs/08 § Errors: the line and (when the status is changed) the reason show their problems on
  // the field; Confirm & Send stays enabled except while sending.
  const schema = useMemo(() => checkInFormSchema(overridden), [overridden]);
  const fe = useFieldErrors({ schema, values: { narrative, overrideReason: reason }, idPrefix: `pm-update-${r.projectId}` });

  /** The product line from this week's market check-ins (worst RAG, a clause per market). */
  const draftFromMarkets = async () => {
    setComposing(true);
    setError(null);
    const res = await fetch(`/api/projects/${r.projectId}/checkin/from-markets`, { method: "POST" });
    const d = await res.json().catch(() => null);
    setComposing(false);
    if (!res.ok || !d?.data) {
      setError(d?.error?.message ?? "Could not draft from the markets.");
      return;
    }
    setNarrative(d.data.narrative);
    setRag(d.data.rag);
    setReason(d.data.rag !== r.computedRag ? `Worst of ${d.data.markets.length} market check-ins` : "");
    setComposed(`${d.data.markets.length} of ${d.data.markets.length + d.data.missing.length} markets${d.data.missing.length ? ` · no check-in yet: ${d.data.missing.join(", ")}` : ""}`);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (busy || !fe.validate()) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${r.projectId}/checkin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ narrative: narrative.trim(), ...(overridden ? { ragOverride: rag, overrideReason: reason.trim() } : {}) }),
    });
    setBusy(false);
    const d = await res.json().catch(() => null);
    if (res.ok && d?.data) {
      dispatchTourEvent("update-sent");
      onSent({
        ...r,
        confirmed: true,
        status: "Confirmed",
        sentToHead: Boolean(d.data.submittedToHeadAt),
        sentAt: d.data.submittedToHeadAt ?? null,
        narrative: d.data.narrative ?? narrative,
        effectiveRag: d.data.effectiveRag ?? r.effectiveRag,
        ragOverride: overridden ? rag : null,
      });
    } else {
      const { message, fields } = readApiError(d, "Could not send the update. Try again.");
      const { _: root, ...onFields } = fields;
      if (Object.keys(onFields).length > 0) {
        fe.setServerErrors(onFields, ["narrative", "overrideReason"]);
        if (root) setError(root);
      } else setError(message);
    }
  };

  return (
    <DrawerFrame
      onSubmit={(e) => void send(e)}
      header={<DrawerHeader step="Weekly Update" title={r.name} subtitle={`${r.code} · ${r.portfolioName}`} />}
      footer={
        <DrawerFooter note={r.sentToHead ? "Resending notifies the Head again." : undefined}>
          <button type="button" onClick={onCancel} className={SECONDARY}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY}>
            <Send className="size-3.5" aria-hidden /> {busy ? "Sending…" : r.confirmed ? "Confirm & Resend" : "Confirm & Send"}
          </button>
        </DrawerFooter>
      }
    >
      {r.draftLines.length > 0 && (
        <DrawerSection title="Drafted From the Board">
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {r.draftLines.slice(0, 4).map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-[1.5] text-[var(--ds-ink2)]">
                <span className="mt-[7px] size-1.5 flex-none rounded-full" style={{ background: LINE_DOT[lineTone(line)] }} aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}
      <DrawerSection title="Status">
        <Choice label="Status" rag value={rag} options={RAGS.map((o) => ({ value: o, label: RAG_WORD[o], tone: RAG_TONE[o] }))} onChange={setRag} />
        <DrawerText hint>QUBIT calculates {RAG_WORD[r.computedRag].toLowerCase()}.</DrawerText>
      </DrawerSection>
      <Field label="Line for the Head" htmlFor={fe.idOf("narrative")} error={fe.errors.narrative} hint={`${narrative.length}/500`}>
        <textarea {...fe.bind("narrative")} value={narrative} onChange={(e) => setNarrative(e.target.value)} maxLength={500} rows={3} placeholder="What leadership should know this week" className={FIELD_TEXTAREA} />
      </Field>
      {r.marketsTotal > 0 && (
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => void draftFromMarkets()} disabled={composing || r.marketsCheckedIn === 0} className={cn(TEXT_LINK, "self-start disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50")}>
            {composing ? "Drafting…" : `Draft From Market Check-ins (${r.marketsCheckedIn} of ${r.marketsTotal})`}
          </button>
          {r.marketsCheckedIn === 0 && <DrawerText hint>No market has checked in this week yet.</DrawerText>}
          {composed && <DrawerText hint>Drafted from {composed}.</DrawerText>}
        </div>
      )}
      {overridden && (
        <Field label="Why Your Status Differs" htmlFor={fe.idOf("overrideReason")} error={fe.errors.overrideReason} hint="Required. The Head sees it; the override expires in 7 days.">
          <input {...fe.bind("overrideReason")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="For example: the blocker clears on Monday" className={FIELD_INPUT} />
        </Field>
      )}
      {error && <DrawerError>{error}</DrawerError>}
      <TextLink href={workspaceOf(r)} className="self-start">
        Open Workspace
      </TextLink>
    </DrawerFrame>
  );
}

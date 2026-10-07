"use client";

import { dispatchTourEvent } from "@/components/tour/tour-events";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Send, ShieldAlert, Upload } from "lucide-react";
import { StatusUploadDialog } from "@/components/reports/status-upload-dialog";
import { RagTally, WeekMeter } from "@/components/reports/week-meter";
import { LocalTime } from "@/components/reports/local-time";
import { lineTone, TONE_TOKEN } from "@/lib/status-lines";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, PRIMARY, QUIET, RAG_TOKEN, SECONDARY, ragChipStyle, ragFill } from "@/lib/surface";
import type { Rag } from "@/server/health";

/**
 * Milestone B — the PM's week on /reports (the My week queue, re-homed): every project
 * you run, the draft to confirm against, one line, the RAG, one button. Confirming IS
 * sending (Milestone A). Sent rows sink to the bottom as the queue drains. Oct 2026: the
 * weekly status report (Word/Excel/PDF) can be uploaded to fill every draft at once, and
 * "Confirm & send all" sends the filled drafts in one go.
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
}

const RAGS = ["Green", "Amber", "Red"] as const;
const RANK: Record<Rag, number> = { Red: 0, Amber: 1, Green: 2 };
const stage = (r: PmRowJson) => (!r.confirmed ? 0 : !r.sentToHead ? 1 : 2);
const sortRows = (rows: PmRowJson[]) =>
  [...rows].sort((a, b) => stage(a) - stage(b) || RANK[a.effectiveRag] - RANK[b.effectiveRag] || a.name.localeCompare(b.name));

export function PmWeek({ isCurrent, rows: initial, canUpload = false }: { isoWeek: string; isCurrent: boolean; rows: PmRowJson[]; canUpload?: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<PmRowJson[]>(initial);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [sendingAll, setSendingAll] = useState<{ done: number; total: number } | null>(null);
  const [sendAllErrors, setSendAllErrors] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(() => initial.find((r) => !r.confirmed && r.canConfirm)?.projectId ?? null);

  // The server re-renders after an upload fills the drafts (router.refresh) — the queue
  // must follow, or the filled lines never show without a hard reload.
  useEffect(() => {
    setRows(sortRows(initial));
  }, [initial]);

  const onChange = (next: PmRowJson) => {
    setRows((prev) => sortRows(prev.map((p) => (p.projectId === next.projectId ? next : p))));
    if (next.sentToHead) setOpenId(rows.find((r) => r.projectId !== next.projectId && !r.confirmed && r.canConfirm)?.projectId ?? null);
  };

  if (rows.length === 0) {
    return (
      <div className={`${CARD} p-8 text-center`} style={CARD_BG} data-tour="pm-week">
        <p className="text-[13px] font-semibold text-[var(--qink)]">You don&apos;t lead any projects this week — your work is reported from the board.</p>
        <Link href="/board" className={`mt-2 inline-block ${QUIET}`}>
          Open My Board →
        </Link>
      </div>
    );
  }

  const sent = rows.filter((r) => r.sentToHead).length;
  const toSend = rows.length - sent;
  const counts = { green: 0, amber: 0, red: 0 };
  for (const r of rows) {
    if (r.effectiveRag === "Green") counts.green++;
    else if (r.effectiveRag === "Amber") counts.amber++;
    else counts.red++;
  }

  // Rows a bulk send can take as they are: drafted narrative, confirmable, not yet sent.
  const sendable = rows.filter((r) => isCurrent && r.canConfirm && !r.confirmed && (r.narrative ?? "").trim());

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

  return (
    <section data-tour="pm-week" className={`${CARD} overflow-hidden`} style={CARD_BG} aria-labelledby="pm-week">
      <h2 id="pm-week" className="sr-only">
        This week&apos;s updates
      </h2>
      <WeekMeter
        done={sent}
        total={rows.length}
        label={`${sent} of ${rows.length} sent`}
        sub={!isCurrent ? "week closed" : toSend > 0 ? `${toSend} to send before Friday 5pm` : "all sent — the Head has this week"}
        ariaLabel="Weekly reporting progress"
      >
        <div className="flex flex-wrap items-center gap-2" data-tour="pm-week-actions">
          <RagTally counts={counts} />
          {canUpload && isCurrent && (
            <button type="button" onClick={() => setUploadOpen(true)} className={`${SECONDARY} gap-1.5`}>
              <Upload className="size-3.5" aria-hidden /> Upload status report
            </button>
          )}
          {sendable.length >= 2 && (
            <button type="button" onClick={() => void sendAll()} disabled={sendingAll !== null} className={`${PRIMARY} gap-1.5`}>
              <Send className="size-3.5" aria-hidden /> {sendingAll ? `Sending ${sendingAll.done + 1} of ${sendingAll.total}…` : `Confirm & send all ${sendable.length}`}
            </button>
          )}
        </div>
      </WeekMeter>
      {sendAllErrors.length > 0 && (
        <p role="alert" className="px-[18px] py-2 text-[12px] text-[var(--bad)]">
          {sendAllErrors.join(" · ")}
        </p>
      )}
      {canUpload && (
        <StatusUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onApplied={() => router.refresh()}
        />
      )}
      <ul>
        {rows.map((r) => (
          <PmRow
            // Re-seed the editor when the server hands us a different draft (an upload filled it).
            key={`${r.projectId}:${r.status}:${r.narrative ?? ""}:${r.ragOverride ?? ""}`}
            row={r}
            open={openId === r.projectId}
            isCurrent={isCurrent}
            onOpen={() => setOpenId(r.projectId)}
            onChange={onChange}
          />
        ))}
      </ul>
    </section>
  );
}

function RagDot({ rag }: { rag: Rag }) {
  return <span className="size-[9px] flex-none rounded-full" style={ragFill(rag)} role="img" aria-label={`Status ${rag}`} />;
}

function PmRow({
  row: r,
  open,
  isCurrent,
  onOpen,
  onChange,
}: {
  row: PmRowJson;
  open: boolean;
  isCurrent: boolean;
  onOpen: () => void;
  onChange: (r: PmRowJson) => void;
}) {
  const [narrative, setNarrative] = useState(r.narrative ?? r.draftLines[0] ?? "");
  const [rag, setRag] = useState<Rag>(r.ragOverride ?? r.effectiveRag);
  const [reason, setReason] = useState(r.overrideReason ?? "");
  const [reasonTouched, setReasonTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overridden = rag !== r.computedRag;
  const reasonOk = !overridden || reason.trim().length >= 5;
  const workspace = `/projects/${r.projectId}?tab=This%20week`;
  const legacyUnsent = r.confirmed && !r.sentToHead;

  const send = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${r.projectId}/checkin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ narrative: narrative.trim(), ...(overridden ? { ragOverride: rag, overrideReason: reason.trim() } : {}) }),
    });
    setBusy(false);
    const d = await res.json().catch(() => null);
    if (res.ok && d?.data) {
      dispatchTourEvent("update-sent");
      onChange({
        ...r,
        confirmed: true,
        status: "Confirmed",
        sentToHead: Boolean(d.data.submittedToHeadAt),
        sentAt: d.data.submittedToHeadAt ?? null,
        narrative: d.data.narrative ?? narrative,
        effectiveRag: d.data.effectiveRag ?? r.effectiveRag,
      });
    } else {
      setError(d?.error?.message ?? "Could not send the update — try again.");
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${r.projectId}/checkin/submit`, { method: "POST" });
    setBusy(false);
    const d = await res.json().catch(() => null);
    if (res.ok && d?.data?.submittedToHeadAt) onChange({ ...r, sentToHead: true, sentAt: d.data.submittedToHeadAt });
    else setError(d?.error?.message ?? "Could not send — try again.");
  };

  // A sent week can be edited and resent (re-confirming IS resending — the Head is notified again).
  const editing = open && r.canConfirm && isCurrent && !legacyUnsent;

  return (
    <li className="flex flex-col gap-2.5 border-b border-[var(--hair2)] p-[12px_18px] last:border-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <RagDot rag={r.confirmed ? r.effectiveRag : (r.ragOverride ?? r.effectiveRag)} />
        <Link href={workspace} className={`rounded-[4px] text-[14px] font-semibold text-[var(--qink)] transition-colors hover:text-brand ${FOCUS}`}>
          {r.name}
        </Link>
        <span className="whitespace-nowrap text-[12px] text-[var(--ink4)]">
          {r.code} · {r.portfolioName}
        </span>
        {r.sentToHead && r.sentAt && (
          <span className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold text-[var(--ok)]">
            <CheckCheck className="size-3.5" aria-hidden /> Sent <LocalTime iso={r.sentAt} format="weekday-time" />
          </span>
        )}
        {!r.confirmed && r.canConfirm && isCurrent && !open && (
          <button type="button" aria-expanded={false} onClick={onOpen} className={`ml-auto ${SECONDARY} px-3 py-1.5 text-[12.5px] text-[var(--qink)]`}>
            Review &amp; send
          </button>
        )}
        {r.sentToHead && r.canConfirm && isCurrent && !open && (
          <button type="button" aria-expanded={false} onClick={onOpen} className={`${QUIET} px-2 text-[12px]`}>
            Edit &amp; resend
          </button>
        )}
      </div>

      {r.confirmed && r.narrative && !editing && <blockquote className="ml-[19px] text-[13px] leading-[1.5] text-[var(--ink3)]">“{r.narrative}”</blockquote>}
      {!r.confirmed && !editing && (
        <p className="ml-[19px] text-[12.5px] text-[var(--ink4)]">
          {r.narrative ? (
            <>
              Draft{r.ragOverride ? ` · ${r.ragOverride}` : ""}: <span className="text-[var(--ink3)]">“{r.narrative}”</span>
            </>
          ) : isCurrent && r.canConfirm ? (
            `Draft: ${r.draftLines[0] ?? "No activity drafted yet"}`
          ) : (
            <span className="italic text-[var(--ink5)]">Not sent</span>
          )}
        </p>
      )}
      {!r.canConfirm && isCurrent && !r.confirmed && <p className="ml-[19px] text-[11px] text-[var(--ink4)]">Read-only — you don&apos;t run this project.</p>}

      {editing && (
        <div className="ml-[19px] grid grid-cols-1 items-start gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-2.5">
            {r.draftLines.length > 0 && (
              <ul className="flex flex-col gap-1">
                {r.draftLines.slice(0, 2).map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] leading-[1.5] text-[var(--ink3)]">
                    <span className="mt-[7px] size-1.5 flex-none rounded-full" style={{ background: `var(${TONE_TOKEN[lineTone(line)]})` }} aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            )}
            <label htmlFor={`pm-line-${r.projectId}`} className="sr-only">
              Your line for leadership
            </label>
            <input
              id={`pm-line-${r.projectId}`}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              maxLength={500}
              placeholder="Your line for leadership"
              className={`h-[38px] w-full rounded-[8px] border border-[var(--input)] bg-background px-3 text-[13.5px] text-foreground placeholder:text-[var(--ink4)] focus:border-brand ${FOCUS}`}
            />
            {overridden && (
              <div className="flex flex-col gap-1">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onBlur={() => setReasonTouched(true)}
                  maxLength={300}
                  aria-label="Why differ from computed?"
                  placeholder="Why differ from computed?"
                  className={`h-8 w-full rounded-[8px] border border-[var(--input)] bg-background px-2.5 text-[12px] text-foreground placeholder:text-[var(--ink4)] focus:border-brand ${FOCUS}`}
                />
                <span className="text-[10.5px] text-[var(--ink5)]">Required · the override expires in 7 days</span>
                {reasonTouched && !reasonOk && <span className="text-[10.5px] text-[var(--bad)]">Give at least 5 characters.</span>}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void send()} disabled={busy || !narrative.trim() || !reasonOk} className={`${PRIMARY} w-full sm:w-auto`}>
                <Send className="size-3.5" aria-hidden /> {busy ? "Sending…" : r.confirmed ? "Resend" : "Confirm & send"}
              </button>
              <Link href={workspace} className={QUIET}>
                Open workspace
              </Link>
            </div>
          </div>
          <fieldset className="flex flex-wrap gap-1">
            <legend className="sr-only">Status</legend>
            {RAGS.map((opt) => {
              const checked = rag === opt;
              const tok = RAG_TOKEN[opt];
              return (
                <label
                  key={opt}
                  title={opt === r.computedRag ? "Computed" : undefined}
                  className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[8px] border px-2.5 py-1.5 text-[12px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--brand)] has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-[var(--cardbg)]"
                  style={checked ? { ...ragChipStyle(opt), borderColor: `color-mix(in oklab, var(${tok}) 35%, transparent)` } : { borderColor: "var(--border)", color: "var(--ink3)" }}
                >
                  <input type="radio" name={`pm-rag-${r.projectId}`} value={opt} checked={checked} onChange={() => setRag(opt)} className="sr-only" />
                  <span className="size-[7px] rounded-full" style={ragFill(opt)} aria-hidden />
                  {opt}
                  {opt === r.computedRag && <span className="sr-only"> (computed)</span>}
                </label>
              );
            })}
          </fieldset>
        </div>
      )}

      {legacyUnsent && r.canConfirm && isCurrent && (
        <div className="ml-[19px] flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void resend()} disabled={busy} className={PRIMARY}>
            <Send className="size-3.5" aria-hidden /> {busy ? "Sending…" : "Send to Head"}
          </button>
          <span className="text-[11px] text-[var(--ink4)]">Confirmed before the one-step change — send it on.</span>
        </div>
      )}
      {r.sentToHead && !editing && (
        <Link href={workspace} className={`ml-[19px] self-start ${QUIET}`}>
          Open workspace
        </Link>
      )}
      {error && (
        <p role="alert" className="ml-[19px] flex items-center gap-1.5 text-[11px] text-[var(--bad)]">
          <ShieldAlert className="size-3" aria-hidden /> {error}
        </p>
      )}
    </li>
  );
}

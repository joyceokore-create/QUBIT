"use client";

import { dispatchTourEvent } from "@/components/tour/tour-events";

import { useEffect, useState } from "react";
import { CheckCheck, Clock, Send, ShieldAlert } from "lucide-react";
import { weekRange } from "@/lib/iso-week";
import { lineTone, TONE_TOKEN } from "@/lib/status-lines";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, PRIMARY, QUIET, RAG_TOKEN, SECONDARY, ragChipStyle, ragFill } from "@/lib/surface";
import type { CheckInJson } from "@/components/panels/project-panel-json";
import type { Rag } from "@/server/health";

/**
 * Milestone A (docs handoff §2) — THE status update: one card, one action. The system
 * drafts the week from the board; the PM reads the bullets, writes one line, picks the
 * Build RAG (computed value pre-selected, an override needs a reason — existing rule) and
 * presses "Confirm & send to Head". Confirm and send are the same act. "Save draft" keeps
 * the line without sending. Replaces the old check-in card's chain rail, "rolls up from"
 * panel and separate send button. Everyone else sees the same card read-only.
 */

const RAGS = ["Green", "Amber", "Red"] as const;
const LABEL = "text-[11.5px] font-semibold text-[var(--ink4)]";

/** Friday 17:00 local is the weekly deadline (docs/19 M3 — the nudger escalates past it).
 * Computed after mount: QUBIT is used across time zones and SSR would guess the wrong day. */
function dueState(now: Date): { text: string; tok: "--warn" | "--bad" } {
  const dow = now.getDay(); // Sun 0 … Sat 6
  if (dow >= 1 && dow <= 4) return { text: "Not sent · due Friday 5pm", tok: "--warn" };
  if (dow === 5 && now.getHours() < 17) return { text: "Not sent · due today 5pm", tok: "--warn" };
  return { text: "Not sent · was due Friday 5pm", tok: "--bad" };
}

function fmtSent(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function StatusUpdateCard({
  projectId,
  ci,
  onChange,
  onGoToDelivery,
}: {
  projectId: string;
  ci: CheckInJson;
  onChange: (ci: CheckInJson) => void;
  onGoToDelivery: () => void;
}) {
  const sent = Boolean(ci.submittedToHeadAt);
  const confirmed = ci.status === "Confirmed";
  const legacyUnsent = confirmed && !sent; // confirmed before Milestone A, never sent
  const [mode, setMode] = useState<"edit" | "view">(!confirmed && ci.canConfirm ? "edit" : "view");
  const [narrative, setNarrative] = useState(ci.narrative ?? "");
  const [rag, setRag] = useState<Rag>((ci.ragOverride as Rag | null) ?? ci.computedRag);
  const [reason, setReason] = useState(ci.overrideReason ?? "");
  const [reasonTouched, setReasonTouched] = useState(false);
  const [busy, setBusy] = useState<"send" | "draft" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const overridden = rag !== ci.computedRag;
  const reasonOk = !overridden || reason.trim().length >= 5;
  const canSend = narrative.trim().length > 0 && reasonOk;
  const activeOverride = Boolean(ci.ragOverride && ci.overrideExpiresAt && new Date(ci.overrideExpiresAt) > new Date());
  const weekNo = ci.isoWeek.split("-W")[1] ?? ci.isoWeek;
  const due = mounted ? dueState(new Date()) : null;

  const body = () => JSON.stringify({ narrative: narrative.trim(), ...(overridden ? { ragOverride: rag, overrideReason: reason.trim() } : {}) });

  const send = async () => {
    setBusy("send");
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/checkin`, { method: "POST", headers: { "content-type": "application/json" }, body: body() });
    setBusy(null);
    const d = await res.json().catch(() => null);
    if (res.ok && d?.data) {
      onChange(d.data as CheckInJson);
      setMode("view");
      setSavedAt(null);
      dispatchTourEvent("update-sent");
    } else {
      setError(d?.error?.message ?? "Could not send the update — try again.");
    }
  };

  const saveDraft = async () => {
    setBusy("draft");
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/checkin`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ narrative: narrative.trim(), ragOverride: overridden ? rag : null, overrideReason: overridden ? reason.trim() : null }),
    });
    setBusy(null);
    const d = await res.json().catch(() => null);
    if (res.ok && d?.data) {
      onChange(d.data as CheckInJson);
      setSavedAt(new Date());
    } else {
      setError(d?.error?.message ?? "Could not save the draft — try again.");
    }
  };

  // Legacy door: a week confirmed before Milestone A still has to be sent explicitly.
  const resend = async () => {
    setBusy("resend");
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/checkin/submit`, { method: "POST" });
    setBusy(null);
    const d = await res.json().catch(() => null);
    if (res.ok && d?.data?.submittedToHeadAt) onChange({ ...ci, submittedToHeadAt: d.data.submittedToHeadAt });
    else setError(d?.error?.message ?? "Could not send — try again.");
  };

  const startEdit = () => {
    setNarrative(ci.narrative ?? "");
    setRag((ci.ragOverride as Rag | null) ?? ci.computedRag);
    setReason(ci.overrideReason ?? "");
    setReasonTouched(false);
    setError(null);
    setMode("edit");
  };

  const editing = mode === "edit" && ci.canConfirm;

  return (
    <section className={`${CARD} overflow-hidden`} style={CARD_BG} aria-labelledby="status-update">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[var(--hair2)] p-[12px_16px]">
        <h2 id="status-update" className="font-heading text-[14px] rv:text-heading-xs font-bold text-[var(--qink)]">
          Status update
        </h2>
        <span className="text-[11.5px] text-[var(--ink4)]">
          Week {weekNo} · {weekRange(new Date())}
        </span>
        <span className="ml-auto inline-flex min-h-[26px] items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={sentPillStyle(sent, legacyUnsent, due)}>
          {sent ? (
            <>
              <CheckCheck className="size-3.5" aria-hidden /> Sent to Head · in this week&apos;s roll-up
            </>
          ) : legacyUnsent ? (
            <>
              <Clock className="size-3.5" aria-hidden /> Confirmed · not yet sent
            </>
          ) : due ? (
            <>
              <Clock className="size-3.5" aria-hidden /> {due.text}
            </>
          ) : null}
        </span>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <div>
            <div className={`mb-1.5 ${LABEL}`}>Drafted from the board</div>
            <ul className="flex flex-col gap-1">
              {ci.lines.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] leading-[1.5] text-[var(--ink2)]">
                  <span className="mt-[7px] size-1.5 flex-none rounded-full" style={{ background: `var(${TONE_TOKEN[lineTone(line)]})` }} aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label htmlFor="su-line" className={`mb-1.5 block ${LABEL}`}>
              Your line for leadership
            </label>
            {editing ? (
              <input
                id="su-line"
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                maxLength={500}
                placeholder="One line in your own words — what should leadership take away this week?"
                className={`h-10 w-full rounded-[8px] border border-[var(--input)] bg-background px-3 text-[13px] text-foreground placeholder:text-[var(--ink4)] transition-colors focus:border-brand ${FOCUS}`}
              />
            ) : ci.narrative ? (
              <>
                <blockquote className="text-[13px] leading-[1.5] text-[var(--qink)]">“{ci.narrative}”</blockquote>
                {activeOverride && ci.overrideReason && ci.overrideExpiresAt && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--warn)]">
                    <ShieldAlert className="size-3" aria-hidden /> Override: {ci.overrideReason} — expires{" "}
                    {new Date(ci.overrideExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11.5px] text-[var(--ink4)]">Awaiting the PM&apos;s update — computed status shown.</p>
            )}
          </div>
        </div>

        {/* RAG column */}
        <div className="flex min-w-[150px] flex-col gap-2 sm:w-[170px]">
          <div className="flex items-baseline justify-between gap-2.5">
            <span className="text-[11.5px] font-semibold text-[var(--qink)]">Build</span>
            <span className="text-[10.5px] text-[var(--ink5)]">gates + board</span>
          </div>
          {editing ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="sr-only">Build status</legend>
              {RAGS.map((opt) => {
                const checked = rag === opt;
                const tok = RAG_TOKEN[opt];
                return (
                  <label
                    key={opt}
                    className="flex cursor-pointer items-center gap-2 rounded-[8px] border px-2.5 py-1.5 text-[12px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--brand)] has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-[var(--cardbg)]"
                    style={
                      checked
                        ? { ...ragChipStyle(opt), borderColor: `color-mix(in oklab, var(${tok}) 35%, transparent)` }
                        : { borderColor: "var(--border)", color: "var(--ink3)" }
                    }
                  >
                    <input type="radio" name={`build-rag-${projectId}`} value={opt} checked={checked} onChange={() => setRag(opt)} className="sr-only" />
                    <span className="size-2 rounded-full" style={ragFill(opt)} aria-hidden />
                    {opt}
                    {opt === ci.computedRag && <span className="ml-auto text-[10px] font-medium text-[var(--ink5)]">computed</span>}
                  </label>
                );
              })}
              {overridden && (
                <div className="mt-1 flex flex-col gap-1">
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
            </fieldset>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-[8px] border px-2.5 py-1.5 text-[12px] font-semibold" style={{ ...ragChipStyle(ci.buildRag), borderColor: `color-mix(in oklab, var(${RAG_TOKEN[ci.buildRag]}) 35%, transparent)` }}>
              <span className="size-2 rounded-full" style={ragFill(ci.buildRag)} aria-hidden />
              {ci.buildRag}
              {ci.buildRag === ci.computedRag && <span className="ml-auto text-[10px] font-medium opacity-80">computed</span>}
            </span>
          )}

          {ci.markets.length > 0 && (
            <>
              <div className="mt-2 flex items-baseline justify-between gap-2.5">
                <span className="text-[11.5px] font-semibold text-[var(--qink)]">In market</span>
                <span className="text-[10.5px] text-[var(--ink5)]">market check-ins</span>
              </div>
              <span
                className="inline-flex items-center gap-2 rounded-[8px] border px-2.5 py-1.5 text-[12px] font-semibold"
                style={
                  ci.marketRag
                    ? { ...ragChipStyle(ci.marketRag), borderColor: `color-mix(in oklab, var(${RAG_TOKEN[ci.marketRag]}) 35%, transparent)` }
                    : { color: "var(--ink4)", borderColor: "var(--border)" }
                }
              >
                <span className="size-2 rounded-full" style={ci.marketRag ? ragFill(ci.marketRag) : { background: "var(--ink5)" }} aria-hidden />
                {ci.marketRag ?? "No check-in"}
                <span className="ml-auto text-[10px] font-medium opacity-80">{ci.markets.map((m) => m.code).join(", ")}</span>
              </span>
              <button type="button" onClick={onGoToDelivery} className={`self-start text-[11.5px] font-semibold text-[var(--brand)] ${FOCUS} rounded-[4px]`}>
                Edit market check-ins →
              </button>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      {ci.canConfirm && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--hair2)] bg-[var(--card2)] p-[10px_16px]">
          {editing ? (
            <>
              <button type="button" onClick={() => void send()} disabled={busy !== null || !canSend} className={`${PRIMARY} w-full sm:w-auto`}>
                <Send className="size-3.5" aria-hidden /> {busy === "send" ? "Sending…" : "Confirm & send to Head"}
              </button>
              {!confirmed && (
                <button type="button" onClick={() => void saveDraft()} disabled={busy !== null} className={SECONDARY}>
                  {busy === "draft" ? "Saving…" : "Save draft"}
                </button>
              )}
              {confirmed && (
                <button type="button" onClick={() => setMode("view")} className={QUIET}>
                  Cancel
                </button>
              )}
              <span className="text-[11px] text-[var(--ink4)]">
                {savedAt && mounted
                  ? `Draft saved ${savedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                  : `One step — this lands in the Head's Week ${weekNo} roll-up.`}
              </span>
            </>
          ) : legacyUnsent ? (
            <>
              <span className="text-[11.5px] text-[var(--ink3)]">
                Confirmed{ci.confirmedAt && mounted ? ` ${fmtSent(ci.confirmedAt)}` : ""} by {ci.confirmedByName ?? "the PM"} · not yet sent
              </span>
              <button type="button" onClick={() => void resend()} disabled={busy !== null} className={`${PRIMARY} ml-auto`}>
                <Send className="size-3.5" aria-hidden /> {busy === "resend" ? "Sending…" : "Send to Head"}
              </button>
              <button type="button" onClick={startEdit} className={QUIET}>
                Edit &amp; resend
              </button>
            </>
          ) : (
            <>
              <span className="text-[11.5px] text-[var(--ink3)]">
                Sent{ci.submittedToHeadAt && mounted ? ` ${fmtSent(ci.submittedToHeadAt)}` : ""} by {ci.confirmedByName ?? "the PM"}.
              </span>
              <button type="button" onClick={startEdit} className={`${QUIET} ml-auto`}>
                Edit &amp; resend
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="flex w-full items-center gap-1.5 text-[11px] text-[var(--bad)]">
              <ShieldAlert className="size-3" aria-hidden /> {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function sentPillStyle(sent: boolean, legacyUnsent: boolean, due: { tok: "--warn" | "--bad" } | null): React.CSSProperties {
  const tok = sent ? "--ok" : legacyUnsent ? "--warn" : (due?.tok ?? "--warn");
  return { color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 10%, transparent)` };
}

"use client";

import { dispatchTourEvent } from "@/components/tour/tour-events";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Choice, DrawerError, DrawerSection, Field, FIELD_TEXTAREA, Kv } from "@/components/ui/drawer";
import { Chip, HealthPill } from "@/components/ui/status-pill";
import { TextButton } from "@/components/ui/text-link";
import { RAG_TONE, RAG_WORD, RAGS, RATING_REASON_MIN } from "@/components/reports/status-workspace-model";
import { CARD, PRIMARY, SECONDARY } from "@/lib/surface";
import { cn } from "@/lib/utils";
import type { CheckInJson } from "@/components/panels/project-panel-json";
import type { Rag } from "@/server/health";

/**
 * Tier 3 (design spec v2, PM "This week") — THE status update: one card, one action. The
 * key/value panel says where the build is and what QUBIT computes; the PM picks the status
 * (computed value pre-selected), writes the line for the Head and presses "Confirm & Send to
 * Head". Choosing a status other than the computed one needs a reason (at least
 * RATING_REASON_MIN characters — the same rule as Reports › Weekly Update), and the override
 * expires in 7 days. "Save Draft" keeps it without sending. Everyone else sees it read-only.
 */

const NARRATIVE_MAX = 500;

/** Friday 17:00 local is the weekly deadline (docs/19 M3 — the nudger escalates past it).
 * Computed after mount: QUBIT is used across time zones and SSR would guess the wrong day. */
function dueText(now: Date): string {
  const dow = now.getDay(); // Sun 0 … Sat 6
  if (dow >= 1 && dow <= 4) return "due Friday 5pm";
  if (dow === 5 && now.getHours() < 17) return "due today 5pm";
  return "was due Friday 5pm";
}

function fmtSent(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function StatusUpdateCard({
  projectId,
  ci,
  buildStatus,
  onChange,
  onGoToMarkets,
}: {
  projectId: string;
  ci: CheckInJson;
  /** "SIT · 3 of 8 gates done" — where the build track stands. */
  buildStatus: string;
  onChange: (ci: CheckInJson) => void;
  /** Opens the market check-ins (the header's Market filter). */
  onGoToMarkets: () => void;
}) {
  const sent = Boolean(ci.submittedToHeadAt);
  const confirmed = ci.status === "Confirmed";
  const legacyUnsent = confirmed && !sent; // confirmed before Milestone A, never sent
  const [mode, setMode] = useState<"edit" | "view">(!confirmed && ci.canConfirm ? "edit" : "view");
  const [narrative, setNarrative] = useState(ci.narrative ?? "");
  const [rag, setRag] = useState<Rag>((ci.ragOverride as Rag | null) ?? ci.computedRag);
  const [reason, setReason] = useState(ci.overrideReason ?? "");
  const [reasonTouched, setReasonTouched] = useState(false);
  const [busy, setBusy] = useState<"send" | "draft" | "resend" | "compose" | null>(null);
  const [composed, setComposed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const overridden = rag !== ci.computedRag;
  const reasonOk = !overridden || reason.trim().length >= RATING_REASON_MIN;
  const canSend = narrative.trim().length > 0 && reasonOk;
  const activeOverride = Boolean(ci.ragOverride && ci.overrideExpiresAt && new Date(ci.overrideExpiresAt) > new Date());
  const weekNo = Number(ci.isoWeek.split("-W")[1] ?? 0) || ci.isoWeek;
  const checkedIn = ci.markets.filter((m) => m.checkedIn).length;

  const body = () => JSON.stringify({ narrative: narrative.trim(), ...(overridden ? { ragOverride: rag, overrideReason: reason.trim() } : {}) });

  /** docs/38 — the product line from this week's market check-ins (worst status, one clause
   * per market), saved as the draft when the week isn't sent yet; prefilled otherwise. */
  const composeFromMarkets = async () => {
    setBusy("compose");
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/checkin/from-markets`, { method: "POST" });
    const d = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok || !d?.data) {
      setError(d?.error?.message ?? "Could not draft from the markets.");
      return;
    }
    setNarrative(d.data.narrative);
    setRag(d.data.rag);
    setReason(d.data.rag !== ci.computedRag ? `Worst of ${d.data.markets.length} market check-ins` : "");
    setMode("edit");
    setComposed(`${d.data.markets.length} of ${d.data.markets.length + d.data.missing.length} markets${d.data.missing.length ? ` · no check-in yet: ${d.data.missing.join(", ")}` : ""}`);
    if (d.data.view) {
      setSavedAt(new Date());
      onChange(d.data.view);
    }
  };

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
      setError(d?.error?.message ?? "Could not send the update. Try again.");
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
      setError(d?.error?.message ?? "Could not save the draft. Try again.");
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
    else setError(d?.error?.message ?? "Could not send. Try again.");
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
  const chip = sent ? <Chip tone="ok">Sent</Chip> : legacyUnsent ? <Chip tone="warn">Confirmed, not sent</Chip> : <Chip tone="info">Draft</Chip>;

  const kv: [string, React.ReactNode][] = [
    ["Build Status", buildStatus],
    ["Computed Status", <HealthPill key="computed" value={ci.computedRag} />],
  ];
  if (ci.markets.length > 0) kv.push(["In Market", ci.marketRag ? <HealthPill key="market" value={ci.marketRag} /> : <Chip key="market">No check-in</Chip>]);
  kv.push(
    sent && ci.submittedToHeadAt
      ? ["Sent", mounted ? `${fmtSent(ci.submittedToHeadAt)} · ${ci.confirmedByName ?? "the PM"}` : "Sent"]
      : ["Sent", mounted ? `Not yet · ${dueText(new Date())}` : "Not yet"],
  );

  return (
    <section className={cn(CARD, "flex min-w-0 flex-col gap-3 px-[18px] py-4")} style={{ background: "var(--ds-card)" }} aria-labelledby="status-update" data-tour="status-update">
      <div className="flex items-center justify-between gap-2.5">
        <h2 id="status-update" className="text-[16px] font-bold text-[var(--ds-ink)]">
          Status Update · Week {weekNo}
        </h2>
        {chip}
      </div>

      <Kv rows={kv} />

      <DrawerSection title="Your Status">
        <Choice
          label="Your status"
          rag
          disabled={!editing}
          value={editing ? rag : ci.buildRag}
          options={RAGS.map((r) => ({ value: r, label: RAG_WORD[r], tone: RAG_TONE[r] }))}
          onChange={(r) => setRag(r)}
        />
        {!editing && activeOverride && ci.overrideReason && ci.overrideExpiresAt && (
          <p className="text-[12px] text-[var(--ds-ink3)]">
            Changed from {RAG_WORD[ci.computedRag].toLowerCase()}: {ci.overrideReason}. Expires {new Date(ci.overrideExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.
          </p>
        )}
      </DrawerSection>

      {editing ? (
        <>
          <Field label="Line for the Head" htmlFor={`su-line-${projectId}`}>
            <textarea
              id={`su-line-${projectId}`}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              maxLength={NARRATIVE_MAX}
              rows={3}
              placeholder="One line in your own words: what should the Head take away this week?"
              className={cn(FIELD_TEXTAREA, "resize-y")}
            />
          </Field>
          <Field
            label="Reason"
            htmlFor={`su-reason-${projectId}`}
            hint={
              overridden
                ? reasonTouched && !reasonOk
                  ? <span className="font-semibold text-[var(--ds-bad-text)]">Give at least {RATING_REASON_MIN} characters.</span>
                  : `Needed because QUBIT calculates ${RAG_WORD[ci.computedRag].toLowerCase()}. At least ${RATING_REASON_MIN} characters; the change expires in 7 days.`
                : "Only if you change the computed status."
            }
          >
            <textarea
              id={`su-reason-${projectId}`}
              value={overridden ? reason : ""}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setReasonTouched(true)}
              disabled={!overridden}
              maxLength={300}
              rows={2}
              placeholder="Why the status differs from the computed one"
              className={cn(FIELD_TEXTAREA, "resize-y disabled:cursor-not-allowed disabled:bg-[var(--ds-surface2)]")}
            />
          </Field>
        </>
      ) : (
        <div className="flex flex-col gap-[5px]">
          <span className="text-[11.5px] font-semibold text-[var(--ds-ink3)]">Line for the Head</span>
          {ci.narrative ? <p className="text-[13px] leading-[1.55] text-[var(--ds-ink)]">{ci.narrative}</p> : <p className="text-[12.5px] text-[var(--ds-ink3)]">No line yet. The computed status is shown until the PM sends one.</p>}
        </div>
      )}

      {ci.markets.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <TextButton onClick={onGoToMarkets} arrow>
            Market Check-ins ({checkedIn} of {ci.markets.length})
          </TextButton>
          {ci.canConfirm && checkedIn > 0 && (
            <TextButton onClick={() => void composeFromMarkets()}>{busy === "compose" ? "Drafting…" : "Draft the Line from Market Check-ins"}</TextButton>
          )}
          {composed && <span className="text-[12px] text-[var(--ds-ink3)]">Drafted from {composed}.</span>}
        </div>
      )}

      {error && <DrawerError>{error}</DrawerError>}

      {ci.canConfirm && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {editing ? (
            <>
              <span className="mr-auto text-[12px] text-[var(--ds-ink3)]">
                {savedAt && mounted ? `Draft saved ${savedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : `Lands in the Head's week ${weekNo} roll-up.`}
              </span>
              {confirmed ? (
                <button type="button" onClick={() => setMode("view")} className={SECONDARY}>
                  Cancel
                </button>
              ) : (
                <button type="button" onClick={() => void saveDraft()} disabled={busy !== null} className={SECONDARY}>
                  {busy === "draft" ? "Saving…" : "Save Draft"}
                </button>
              )}
              <button type="button" onClick={() => void send()} disabled={busy !== null || !canSend} className={PRIMARY}>
                <Send className="size-3.5" aria-hidden /> {busy === "send" ? "Sending…" : "Confirm & Send to Head"}
              </button>
            </>
          ) : legacyUnsent ? (
            <>
              <span className="mr-auto text-[12px] text-[var(--ds-ink3)]">
                Confirmed{ci.confirmedAt && mounted ? ` ${fmtSent(ci.confirmedAt)}` : ""} by {ci.confirmedByName ?? "the PM"}, not sent yet.
              </span>
              <button type="button" onClick={startEdit} className={SECONDARY}>
                Edit &amp; Resend
              </button>
              <button type="button" onClick={() => void resend()} disabled={busy !== null} className={PRIMARY}>
                <Send className="size-3.5" aria-hidden /> {busy === "resend" ? "Sending…" : "Send to Head"}
              </button>
            </>
          ) : (
            <button type="button" onClick={startEdit} className={SECONDARY}>
              Edit &amp; Resend
            </button>
          )}
        </div>
      )}
    </section>
  );
}

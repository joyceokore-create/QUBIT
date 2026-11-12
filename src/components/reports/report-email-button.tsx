"use client";

import { useState } from "react";
import { Check, Mail } from "lucide-react";
import { LocalTime } from "@/components/reports/local-time";
import { PRIMARY, QUIET, SECONDARY } from "@/lib/surface";

/**
 * Milestone D — "Email to executives": one control, used by the Head's rail and the
 * custom-reports builder. Click → an inline confirm naming the recipient count → POST
 * /api/reports/email → "Emailed to N · time". Disabled, with the reason in the title, when
 * email is off for the deployment, no PDF engine is available, or the list is empty.
 */

export interface ReportEmailRequest {
  template: "digest" | "build" | "market" | "dual" | "auto";
  week: string;
  project?: string;
  portfolio?: string;
}

export interface EmailState {
  emailedAt: string | null;
  count: number;
}

export function ReportEmailButton({
  request,
  what,
  recipients,
  emailEnabled,
  pdfAvailable,
  initial,
  variant = "primary",
  onSent,
}: {
  request: ReportEmailRequest;
  /** What is being sent, for the confirm line — "the Week 41 PDF". */
  what: string;
  recipients: number;
  emailEnabled: boolean;
  pdfAvailable: boolean;
  initial?: EmailState;
  variant?: "primary" | "secondary";
  onSent?: (state: EmailState) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<EmailState>(initial ?? { emailedAt: null, count: 0 });
  const [failed, setFailed] = useState(0);

  const reason = !emailEnabled
    ? "Email is off for this deployment."
    : !pdfAvailable
      ? "PDF rendering isn't available here."
      : recipients === 0
        ? "Add recipients first."
        : null;

  const send = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/reports/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
    const body = await res.json().catch(() => null);
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      setError(body?.error?.message ?? "Could not send — try again.");
      return;
    }
    const next = { emailedAt: body.data.emailedAt as string, count: body.data.sent as number };
    setFailed((body.data.failed as string[]).length);
    setState(next);
    onSent?.(next);
  };

  const cls = variant === "primary" ? `${PRIMARY} w-full justify-center` : `${SECONDARY} gap-2`;

  return (
    <div className="flex flex-col gap-1.5">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[8px] bg-[var(--card2)] px-3 py-2 text-[12.5px] text-[var(--ink2)]">
          <span className="min-w-0 flex-1">
            Send {what} to {recipients} {recipients === 1 ? "recipient" : "recipients"}?
          </span>
          <button type="button" onClick={() => void send()} disabled={busy} className={`${PRIMARY} px-3 py-1.5`}>
            {busy ? "Sending…" : "Send"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={QUIET}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} disabled={Boolean(reason)} title={reason ?? undefined} className={cls}>
          <Mail className="size-3.5" aria-hidden /> {state.emailedAt ? "Send again" : "Email to executives"}
        </button>
      )}
      {state.emailedAt && (
        <p role="status" className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink4)]">
          <Check className="size-3 text-[var(--ok)]" aria-hidden />
          Emailed to {state.count} · <LocalTime iso={state.emailedAt} format="date-time" />
          {failed > 0 && <span className="text-[var(--bad)]"> · {failed} failed</span>}
        </p>
      )}
      {reason && !state.emailedAt && <p className="text-[11px] text-[var(--ink5)]">{reason}</p>}
      {error && (
        <p role="alert" className="text-[11px] text-[var(--bad)]">
          {error}
        </p>
      )}
    </div>
  );
}

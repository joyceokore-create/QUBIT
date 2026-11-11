"use client";

import { useState } from "react";
import { Check, Download, FileText, Mail } from "lucide-react";
import { LocalTime } from "@/components/reports/local-time";
import { SECONDARY } from "@/lib/surface";
import { Banner } from "@/components/ui/panel";

// Milestone B — what the executive opens on: the Head's signed line for the week (or the
// honest "not signed yet"), the PDF and CSV once it exists, and their own weekly-email switch.

export function ExecTopCard({
  isoWeek,
  approved,
  inCount,
  subscribed: initialSubscribed,
  emailEnabled,
  pdfAvailable,
}: {
  isoWeek: string;
  approved: { narrative: string | null; approvedByName: string | null; approvedAt: string | null } | null;
  inCount: { in: number; total: number };
  subscribed: boolean;
  emailEnabled: boolean;
  pdfAvailable: boolean;
}) {
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = isoWeek.split("-W")[1];

  const toggle = async () => {
    const next = !subscribed;
    setSubscribed(next);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me/report-subscription", { method: next ? "PUT" : "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setSubscribed(!next);
      setError("Could not change your weekly email — try again.");
    }
  };

  const date = approved?.approvedAt ? <LocalTime iso={approved.approvedAt} format="date" /> : null;
  return (
    <section aria-labelledby="exec-top" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" aria-pressed={subscribed} onClick={() => void toggle()} disabled={busy} className={SECONDARY} title={subscribed ? "Click to stop the Friday email" : undefined}>
          {subscribed ? <Check className="size-3.5 text-[var(--ds-ok-text)]" aria-hidden /> : <Mail className="size-3.5" aria-hidden />}
          {subscribed ? "Emailing You Weekly" : "Email Me Weekly"}
        </button>
        {approved && (
          <>
            <a href={`/api/reports/export?template=digest&week=${isoWeek}${pdfAvailable ? "" : "&format=html"}`} {...(pdfAvailable ? { download: true } : { target: "_blank", rel: "noreferrer" })} className={SECONDARY}>
              <FileText className="size-3.5" aria-hidden /> {pdfAvailable ? "Export PDF" : "Print View"}
            </a>
            <a href={`/api/rollup/export?week=${isoWeek}`} download className={SECONDARY}>
              <Download className="size-3.5" aria-hidden /> Export CSV
            </a>
          </>
        )}
      </div>
      <Banner tone={approved ? "info" : "warn"}>
        <span id="exec-top">
          {approved ? (
            <>
              <b>Signed by the Head</b>
              {date && <> · {date}</>} · {inCount.in} of {inCount.total} updates in{approved.narrative ? <> · “{approved.narrative}”</> : null}
            </>
          ) : (
            <>
              <b>Week {n} isn&apos;t signed yet.</b> The Head hasn&apos;t approved this week&apos;s roll-up · {inCount.in} of {inCount.total} updates in.
            </>
          )}
        </span>
      </Banner>
      {!emailEnabled && <p className="text-[12px] text-[var(--ds-ink3)]">Email is off for this deployment, so the weekly report arrives as an in-app notice.</p>}
      {error && (
        <p role="alert" className="text-[12px] font-semibold text-[var(--ds-bad-text)]">
          {error}
        </p>
      )}
    </section>
  );
}

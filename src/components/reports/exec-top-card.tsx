"use client";

import { useState } from "react";
import { Check, Download, FileText, Mail } from "lucide-react";
import { LocalTime } from "@/components/reports/local-time";
import { CARD_GLASS as CARD, CARD_BG, SECONDARY } from "@/lib/surface";

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

  return (
    <section className={`${CARD} flex flex-wrap items-start gap-x-8 gap-y-4 p-[18px_20px]`} style={CARD_BG} aria-labelledby="exec-top">
      <div className="min-w-[280px] flex-1">
        {approved ? (
          <>
            <p id="exec-top" className="mb-1.5 text-[11.5px] font-semibold text-[var(--ink4)]">
              Head · Week {n}
              {approved.approvedAt && (
                <>
                  {" "}
                  · approved <LocalTime iso={approved.approvedAt} format="date" />
                </>
              )}
            </p>
            <blockquote className="max-w-[640px] text-[17px] font-medium leading-[1.45] text-[var(--qink)] [text-wrap:pretty]">“{approved.narrative}”</blockquote>
          </>
        ) : (
          <>
            <p id="exec-top" className="text-[15px] font-medium text-[var(--qink)]">
              Week {n} — the Head hasn&apos;t signed this week&apos;s roll-up yet.
            </p>
            <p className="mt-1 text-[12.5px] text-[var(--ink4)]">
              {inCount.in} of {inCount.total} updates in
            </p>
          </>
        )}
      </div>
      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-wrap gap-2">
          {approved && (
            <>
              <a href={`/api/reports/export?template=digest&week=${isoWeek}${pdfAvailable ? "" : "&format=html"}`} {...(pdfAvailable ? { download: true } : { target: "_blank", rel: "noreferrer" })} className={`${SECONDARY} gap-2`}>
                <FileText className="size-3.5" aria-hidden /> {pdfAvailable ? "PDF" : "Print view"}
              </a>
              <a href={`/api/rollup/export?week=${isoWeek}`} download className={`${SECONDARY} gap-2`}>
                <Download className="size-3.5" aria-hidden /> CSV
              </a>
            </>
          )}
          <button type="button" aria-pressed={subscribed} onClick={() => void toggle()} disabled={busy} className={`${SECONDARY} gap-2`} title={subscribed ? "Click to stop the Friday email" : undefined}>
            {subscribed ? <Check className="size-3.5 text-[var(--ok)]" aria-hidden /> : <Mail className="size-3.5" aria-hidden />}
            {subscribed ? "Emailing you weekly ✓" : "Email me weekly"}
          </button>
        </div>
        {!emailEnabled && <p className="text-[11px] text-[var(--ink5)]">Email is off for this deployment — you&apos;ll get the in-app notice.</p>}
        {error && (
          <p role="alert" className="text-[11px] text-[var(--bad)]">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

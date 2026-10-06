"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download } from "lucide-react";
import { LocalTime } from "@/components/reports/local-time";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, PRIMARY, SECONDARY, ragChipStyle, ragFill } from "@/lib/surface";

/**
 * Milestone B — the Head's roll-up rail: the week's spread, the one line for the
 * executive, Approve (which assembles the rows live and freezes them — there is no
 * separate build step), then the CSV. The UNSENT_CHECKINS handshake is the one the old
 * RollupStrip had: a legacy confirmed-but-unsent row asks for an explicit "approve anyway".
 */

export interface RollupJson {
  status: "Draft" | "Approved" | "None";
  narrative: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  total: number;
  ragCounts: { green: number; amber: number; red: number; computed: number };
}

export function RollupRail({ isoWeek, isCurrent, canApprove, rollup }: { isoWeek: string; isCurrent: boolean; canApprove: boolean; rollup: RollupJson }) {
  const router = useRouter();
  const [narrative, setNarrative] = useState(rollup.narrative ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAck, setNeedsAck] = useState(false);
  const n = isoWeek.split("-W")[1];
  const approved = rollup.status === "Approved";
  const c = rollup.ragCounts;
  const sum = c.green + c.amber + c.red || 1;

  const approve = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/rollup/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ narrative: narrative.trim(), acknowledgeUnsent: needsAck }),
    });
    setBusy(false);
    if (res.ok) {
      setNeedsAck(false);
      router.refresh();
      return;
    }
    const err = (await res.json().catch(() => null))?.error;
    if (err?.code === "UNSENT_CHECKINS") setNeedsAck(true);
    setError(err?.message ?? "Could not approve — try again.");
  };

  return (
    <section className={`${CARD} overflow-hidden`} style={CARD_BG} aria-labelledby="rollup-rail">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--hair2)] p-[14px_16px]">
        <h2 id="rollup-rail" className="whitespace-nowrap text-[15px] font-semibold text-[var(--qink)]">
          Week {n} roll-up
        </h2>
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold" style={ragChipStyle(approved ? "Green" : "Amber")}>
          {approved && <Check className="size-3" aria-hidden />}
          {approved ? "Approved" : "Draft"}
        </span>
      </div>
      <div className="flex flex-col gap-3.5 p-[14px_16px]">
        <div className="flex flex-col gap-1.5">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--wash2)]" role="img" aria-label={`${c.green} green, ${c.amber} amber, ${c.red} red`}>
            <span style={{ width: `${(c.green / sum) * 100}%`, ...ragFill("Green") }} />
            <span style={{ width: `${(c.amber / sum) * 100}%`, ...ragFill("Amber") }} />
            <span style={{ width: `${(c.red / sum) * 100}%`, ...ragFill("Red") }} />
          </div>
          <div className="flex flex-wrap gap-3 text-[12px] text-[var(--ink3)]">
            <span>
              <b className="text-[var(--qink)]">{c.green}</b> Green
            </span>
            <span>
              <b className="text-[var(--qink)]">{c.amber}</b> Amber
            </span>
            <span>
              <b className="text-[var(--qink)]">{c.red}</b> Red
            </span>
            <span className="ml-auto text-[var(--ink4)]">{c.computed} computed</span>
          </div>
        </div>

        <div>
          <label htmlFor="rollup-line" className="mb-1.5 block text-[11.5px] font-semibold text-[var(--ink4)]">
            The week in one line, for the executive
          </label>
          {approved || !canApprove ? (
            <>
              {rollup.narrative ? (
                <blockquote className="text-[13.5px] leading-[1.5] text-[var(--qink)]">“{rollup.narrative}”</blockquote>
              ) : (
                <p className="text-[12.5px] italic text-[var(--ink5)]">No narrative</p>
              )}
              {approved && (
                <p className="mt-1.5 text-[12px] text-[var(--ink4)]">
                  Signed by {rollup.approvedByName ?? "the Head of PMs"}
                  {rollup.approvedAt && (
                    <>
                      {" "}
                      · <LocalTime iso={rollup.approvedAt} format="date-time" />
                    </>
                  )}
                </p>
              )}
              {!approved && !isCurrent && <p className="mt-1.5 text-[12px] text-[var(--ink4)]">Not approved — the week closed without a signed roll-up.</p>}
            </>
          ) : (
            <textarea
              id="rollup-line"
              rows={3}
              maxLength={1000}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              className={`w-full resize-none rounded-[8px] border border-[var(--input)] bg-background px-3 py-2.5 text-[13px] leading-[1.5] text-foreground focus:border-brand ${FOCUS}`}
            />
          )}
        </div>

        {approved ? (
          <div className="flex flex-col gap-2">
            <a href={`/api/rollup/export?week=${isoWeek}`} download className={`${SECONDARY} w-full justify-center gap-2`}>
              <Download className="size-3.5" aria-hidden /> Download CSV
            </a>
            <p className="text-center text-[11.5px] text-[var(--ink5)]">PDF and email land with the export milestone.</p>
          </div>
        ) : canApprove ? (
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => void approve()} disabled={busy || narrative.trim().length < 5} className={`${PRIMARY} w-full justify-center`}>
              {busy ? "Approving…" : needsAck ? "Approve anyway (include unsent)" : "Approve roll-up"}
            </button>
            <p className="text-center text-[12px] text-[var(--ink4)]">
              Freezes the {rollup.total} lines above as this week&apos;s record. Missing projects go in as computed status.
            </p>
          </div>
        ) : (
          !isCurrent && (
            <a href={`/api/rollup/export?week=${isoWeek}`} download className={`${SECONDARY} w-full justify-center gap-2`}>
              <Download className="size-3.5" aria-hidden /> Download CSV
            </a>
          )
        )}
        {error && (
          <p role="alert" className="text-[11px] text-[var(--bad)]">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

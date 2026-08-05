"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RollupView } from "@/server/portfolio-reports";
import { Panel } from "@/components/dashboard/presets/v2-sections";

// M-P3b (docs/34) — the Head's approve strip: build the draft, write the one narrative
// line, sign it. Approving freezes the rows; the exec hero shows the narrative.
export function RollupStrip({ rollup }: { rollup: RollupView }) {
  const router = useRouter();
  const [narrative, setNarrative] = useState(rollup.narrative ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (url: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!res.ok) setError((await res.json().catch(() => null))?.error?.message ?? "Failed.");
    else router.refresh();
  };

  return (
    <Panel
      title={`Week ${rollup.isoWeek.split("-W")[1]} roll-up`}
      sub={
        rollup.status === "Approved"
          ? `APPROVED${rollup.approvedByName ? ` · ${rollup.approvedByName.toUpperCase()}` : ""}`
          : `${rollup.submitted}/${rollup.total} SUBMITTED · ${rollup.confirmed}/${rollup.total} CONFIRMED`
      }
    >
      <div className="flex flex-col gap-2.5 p-[4px_16px_12px]">
        {rollup.status === "Approved" ? (
          <p className="text-[13px] text-[var(--ink2)]">“{rollup.narrative}”</p>
        ) : (
          <>
            <p className="text-[11.5px] text-[var(--ink4)]">
              {rollup.status === "None"
                ? "No roll-up yet this week — build the draft from the PM check-ins above, annotate, approve."
                : "Draft built. The narrative below is the line the executive reads — then approve to freeze it."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void call("/api/rollup")}
                className="rounded-[8px] border border-[var(--w10)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--ink2)]"
              >
                {rollup.status === "None" ? "Build draft" : "Rebuild from live check-ins"}
              </button>
              <input
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                placeholder="The week in one line — what should the executive read?"
                className="h-8 min-w-[260px] flex-1 rounded-[8px] border border-ink-4 bg-background px-2.5 text-[12px] text-foreground outline-none focus:border-brand"
              />
              <button
                type="button"
                disabled={busy || narrative.trim().length < 5}
                onClick={() => void call("/api/rollup/approve", { narrative: narrative.trim() })}
                className="rounded-[8px] bg-[var(--brand)] px-3.5 py-1.5 text-[11.5px] font-bold text-[var(--onbrand)] disabled:opacity-50"
              >
                Approve roll-up →
              </button>
            </div>
          </>
        )}
        {error && <p className="text-[11px] text-[var(--bad)]">{error}</p>}
      </div>
    </Panel>
  );
}

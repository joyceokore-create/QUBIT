import Link from "next/link";
import { FileText } from "lucide-react";
import { LocalTime } from "@/components/reports/local-time";
import type { ApprovedRollup } from "@/server/portfolio-reports";
import { FOCUS } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * Plan Phase 4 — the Head's signed managerial summary on the Executive's Portfolio Home,
 * above the Daily Brief: this week's when approved, else last week's (marked as such).
 * Renders nothing until a Head has signed a roll-up.
 */
export function HeadSummary({ rollup, isCurrent }: { rollup: ApprovedRollup | null; isCurrent: boolean }) {
  if (!rollup?.narrative) return null;
  const n = rollup.isoWeek.split("-W")[1];
  return (
    <section aria-label="Head's summary" className="flex flex-col gap-2 rounded-[var(--ds-radius-card)] border border-[var(--ds-bd)] bg-[var(--ds-card)] px-5 py-4 shadow-[var(--ds-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-[var(--ds-ink3)]">
          Head&apos;s Summary · Week {n}
          {!isCurrent && " · last week"}
        </span>
        <Link href="/reports" className={cn("inline-flex items-center gap-1 rounded-[6px] text-[12px] font-semibold text-[var(--ds-ink3)] hover:text-[var(--ds-brand-ink)]", FOCUS)}>
          <FileText className="size-3.5" aria-hidden /> Weekly report
        </Link>
      </div>
      <p className="whitespace-pre-line text-[13.5px] leading-[1.55] text-[var(--ds-ink)]">{rollup.narrative}</p>
      <p className="text-[12px] text-[var(--ds-ink3)]">
        Signed by {rollup.approvedByName ?? "the Head"}
        {rollup.approvedAt && (
          <>
            {" "}
            · <LocalTime iso={rollup.approvedAt.toISOString()} format="date-time" />
          </>
        )}{" "}
        · {rollup.confirmed} of {rollup.total} updates in
      </p>
    </section>
  );
}

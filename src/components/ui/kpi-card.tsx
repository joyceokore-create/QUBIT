import type { ReactNode } from "react";
import { CARD } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX plan U8 KPI card: the standard white card — label, figure (+ unit), an optional
 * one-line context, an optional small chart. The change against the last period sits at
 * the TOP RIGHT on the label's line, short and plain ("+1 vs last week"), coloured only
 * when it is good or bad. No space is reserved for a chart a card doesn't have, so cards
 * in a row stay level without white gaps (the grid stretches them to equal height).
 */
export interface KpiCardProps {
  label: string;
  value: ReactNode;
  /** e.g. "of 24" */
  unit?: string;
  /** e.g. "+1 vs last week", "Same as last week" */
  change?: string;
  changeTone?: "good" | "bad" | "neutral";
  /** One line under the figure, e.g. "2 need a decision". */
  context?: ReactNode;
  /** Optional small chart (meter, bars or sparkline). */
  chart?: ReactNode;
  className?: string;
}

const TONE = { good: "text-[var(--ok-ink)]", bad: "text-[var(--bad-ink)]", neutral: "text-[var(--ink3)]" } as const;

export function KpiCard({ label, value, unit, change, changeTone = "neutral", context, chart, className }: KpiCardProps) {
  return (
    <div className={cn(CARD, "flex min-w-0 flex-col gap-1 px-4 py-3.5", className)} style={{ background: "var(--cardbg)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-[var(--ink3)]">{label}</span>
        {change && <span className={cn("whitespace-nowrap text-[12px] font-semibold", TONE[changeTone])}>{change}</span>}
      </div>
      <div className="text-[24px] font-bold leading-tight tabular-nums text-[var(--qink)]">
        {value}
        {unit && <span className="ml-1.5 text-[12.5px] font-semibold text-[var(--ink3)]">{unit}</span>}
      </div>
      {context && <div className="text-[12.5px] text-[var(--ink3)]">{context}</div>}
      {chart && <div className="mt-1.5">{chart}</div>}
    </div>
  );
}

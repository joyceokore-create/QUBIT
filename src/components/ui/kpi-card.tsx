import type { ReactNode } from "react";
import { CARD } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * Design spec v2 KPI card (docs/08 § KPI row and card; UX plan U8): label 12/600 with the
 * period change at the top right, figure 23/700 (+ unit), an optional context line, and an
 * optional mini chart pinned to the bottom (`margin-top: auto`) so charts in a row line up.
 * `feat` is the dark featured card. Context and change are coloured only when good or bad.
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
  contextTone?: "good" | "bad" | "neutral";
  /** Optional mini chart (RagBar, Bars, Meter or Spark from ./kpi-charts). */
  chart?: ReactNode;
  feat?: boolean;
  className?: string;
}

const TONE = { good: "text-[var(--ds-ok-text)]", bad: "text-[var(--ds-bad-text)]", neutral: "" } as const;

export function KpiCard({ label, value, unit, change, changeTone = "neutral", context, contextTone = "neutral", chart, feat = false, className }: KpiCardProps) {
  const sub = feat ? "text-[var(--ds-feat-sub)]" : "text-[var(--ds-ink3)]";
  return (
    <div
      className={cn(CARD, "flex min-w-0 flex-col gap-1 rounded-[var(--ds-radius-kpi)] px-4 py-3.5", feat && "border-transparent", className)}
      style={{ background: feat ? "var(--ds-feat-bg)" : "var(--ds-card)", color: feat ? "var(--ds-feat-fg)" : "var(--ds-ink)" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("text-[12px] font-semibold", sub)}>{label}</span>
        {change && <span className={cn("whitespace-nowrap text-[11.5px] font-semibold", sub, !feat && TONE[changeTone])}>{change}</span>}
      </div>
      <div className="text-[23px] font-bold leading-[1.2] tabular-nums">
        {value}
        {unit && <span className={cn("ml-[5px] text-[12px] font-semibold", sub)}>{unit}</span>}
      </div>
      {context && <div className={cn("text-[11.5px]", sub, !feat && TONE[contextTone])}>{context}</div>}
      {chart && <div className="mt-auto pt-2">{chart}</div>}
    </div>
  );
}

/** The KPI row: the first card wider (`1.4fr 1fr 1fr 1fr`), gap 12. Reports pass `equal`.
 * Two columns below lg, one below sm. */
export function KpiRow({ children, count, equal = false, label = "Key figures" }: { children: ReactNode; count: 3 | 4; equal?: boolean; label?: string }) {
  const cols = equal ? (count === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3") : count === 4 ? "lg:grid-cols-[1.4fr_1fr_1fr_1fr]" : "lg:grid-cols-[1.4fr_1fr_1fr]";
  return (
    <section aria-label={label} className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", cols)}>
      {children}
    </section>
  );
}

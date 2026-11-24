import type { ReactNode } from "react";
import { healthKey, healthWord } from "@/lib/status-words";
import { cn } from "@/lib/utils";

/**
 * Design spec v2 chips (docs/08 § Components › Chips): 11px/600, 2×8 padding, pill, no dot.
 * Every chip carries a word, so colour is never the only signal. Text uses the --ds-*-text
 * tokens (AA on the wash in both themes — deviation 1); the wash is the design's.
 */
export type ChipTone = "ok" | "warn" | "bad" | "info" | "vio" | "teal" | "muted";

const TONE_CLASS: Record<ChipTone, string> = {
  ok: "bg-[var(--ds-okw)] text-[var(--ds-ok-text)]",
  warn: "bg-[var(--ds-warnw)] text-[var(--ds-warn-text)]",
  bad: "bg-[var(--ds-badw)] text-[var(--ds-bad-text)]",
  info: "bg-[var(--ds-infow)] text-[var(--ds-info-text)]",
  vio: "bg-[var(--ds-viow)] text-[var(--ds-vio-text)]",
  teal: "bg-[var(--ds-tealw)] text-[var(--ds-teal-text)]",
  muted: "bg-[var(--ds-mutedw)] text-[var(--ds-ink2)]",
};

export const CHIP = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-[1.5]";

/** The one chip. Sentence case words ("On track", "Head approval needed"). */
export function Chip({ tone = "muted", children, className }: { tone?: ChipTone; children: ReactNode; className?: string }) {
  return <span className={cn(CHIP, TONE_CLASS[tone], className)}>{children}</span>;
}

const HEALTH_TONE = { ok: "ok", warn: "warn", bad: "bad" } as const;

/** On track / At risk / Off track (from Green/Amber/Red, G/A/R or OnTrack/AtRisk/Overdue). */
export function HealthPill({ value, className }: { value: string | null | undefined; className?: string }) {
  const k = healthKey(value);
  return (
    <Chip tone={k ? HEALTH_TONE[k] : "muted"} className={className}>
      {healthWord(value)}
    </Chip>
  );
}

const STAGE_TONE: Record<string, ChipTone> = { Exploring: "info", Evaluating: "vio", Approved: "teal", Live: "ok" };

/** A lifecycle stage in its own colour: Intake grey · Exploring blue · Evaluating violet ·
 * Approved teal · Live green. */
export function StagePill({ stage, className }: { stage: string; className?: string }) {
  return (
    <Chip tone={STAGE_TONE[stage] ?? "muted"} className={className}>
      {stage}
    </Chip>
  );
}

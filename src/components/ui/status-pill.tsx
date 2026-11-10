import { healthKey, healthWord, stageToken } from "@/lib/status-words";
import { cn } from "@/lib/utils";

/**
 * UX plan D8a/U4 pills. Every pill carries a word, so colour is never the only signal;
 * text uses the --*-ink tokens on a 12% wash of the same hue (≥ 4.5:1 in both themes).
 */
const PILL = "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[12px] font-semibold";

const HEALTH_INK = { ok: "--ok-ink", warn: "--warn-ink", bad: "--bad-ink" } as const;

/** On track / At risk / Off track (from Green/Amber/Red, G/A/R or OnTrack/AtRisk/Overdue). */
export function HealthPill({ value, className }: { value: string | null | undefined; className?: string }) {
  const k = healthKey(value);
  const ink = k ? HEALTH_INK[k] : "--ink3";
  return (
    <span className={cn(PILL, className)} style={{ color: `var(${ink})`, background: `color-mix(in oklab, var(${ink}) 12%, transparent)` }}>
      <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: "currentColor" }} />
      {healthWord(value)}
    </span>
  );
}

/** A lifecycle stage in its own colour: Intake grey · Exploring blue · Evaluating violet ·
 * Approved teal · Live green. */
export function StagePill({ stage, className }: { stage: string; className?: string }) {
  const tok = stageToken(stage);
  return (
    <span className={cn(PILL, className)} style={{ color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 12%, transparent)` }}>
      {stage}
    </span>
  );
}

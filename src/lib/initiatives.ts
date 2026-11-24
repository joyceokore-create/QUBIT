import { inactiveReason, lifecycleStage, type LifecycleStage } from "@/lib/lifecycle";
import { dayKey } from "@/lib/dates";
import type { HealthBucket } from "@/lib/project-gate-view";

/**
 * UX10 (UX plan D8a/D8b) — the Portfolios page: every initiative (open ideas + projects)
 * through its lifecycle. Pure and client-safe; the server read is src/server/initiatives.ts.
 *
 * Stage rule: projects use `lifecycleStage` (src/lib/lifecycle.ts), plus one overlay — a
 * project in a portfolio whose category is "Shelved" is Inactive (reason Shelved) unless it
 * is already Live or otherwise inactive. Open ideas (New / Reviewing) are Intake; decided
 * ideas are not initiatives here (Accepted ones are projects, Parked/Merged stopped).
 *
 * Invariant: the five card counts plus the Inactive count always equal All.
 */

export const CARD_STAGES = ["Intake", "Exploring", "Evaluating", "Approved", "Live"] as const;
export type CardStage = (typeof CARD_STAGES)[number];
export type InitiativeStage = CardStage | "Inactive";
export type InactiveReason = "Paused" | "Shelved" | "Cancelled";

/** Stages where an item can be "Stuck" — the decision pipeline. Approved is in delivery
 * (health covers it) and Live is the end of the line, so neither is ever stuck. */
export const STUCK_STAGES: readonly CardStage[] = ["Intake", "Exploring", "Evaluating"];
export const STUCK_AFTER_DAYS = 30;
/** Change lines stay hidden until stage snapshots cover this many days. */
export const CHANGE_HISTORY_DAYS = 28;

export const INITIATIVE_TABS = ["all", "pipeline", "delivery", "inactive"] as const;
export type InitiativeTab = (typeof INITIATIVE_TABS)[number];
export const TAB_LABEL: Record<InitiativeTab, string> = { all: "All", pipeline: "Pipeline", delivery: "Delivery", inactive: "Inactive" };
const TAB_STAGES: Record<InitiativeTab, readonly InitiativeStage[]> = {
  all: [...CARD_STAGES, "Inactive"],
  pipeline: ["Intake", "Exploring", "Evaluating"],
  delivery: ["Approved", "Live"],
  inactive: ["Inactive"],
};
export const STAGE_ORDER: readonly InitiativeStage[] = [...CARD_STAGES, "Inactive"];

export interface InitiativeRow {
  kind: "project" | "idea";
  id: string;
  /** Project code; null for an idea. */
  code: string | null;
  name: string;
  /** The project's portfolio, or the idea's suggested one. */
  portfolio: { id: string; name: string } | null;
  stage: InitiativeStage;
  inactiveReason: InactiveReason | null;
  /** This week's confirmed check-in (projects in Exploring → Approved); null = not shown. */
  health: HealthBucket | null;
  sponsor: string | null;
  /** Project priority; null for an idea. */
  priority: string | null;
  /** ISO instant the item entered its stage (idea: submitted). Null = unknown. */
  stageEnteredAt: string | null;
  /** UX fidelity Tier 2 "Next step": a project's next open milestone ("SIT exit · 2026-11-14"),
   * or an idea's triage state. Null when nothing is scheduled. */
  nextStep: { text: string; dueDate: string | null } | null;
}

/** The project's initiative stage: the lifecycle rule plus the Shelved-portfolio overlay. */
export function projectInitiativeStage(p: {
  status: string;
  pipelineStage: string;
  priority?: string | null;
  portfolioCategory?: string | null;
}): { stage: InitiativeStage; reason: InactiveReason | null } {
  // Shelved is part of the shared lifecycle rule now (src/lib/lifecycle.ts).
  const stage = lifecycleStage(p) as InitiativeStage;
  if (stage !== "Inactive") return { stage, reason: null };
  return { stage, reason: inactiveReason(p) ?? "Shelved" };
}

/**
 * Apply the Shelved overlay to a lifecycle stage (also used on snapshot stages, with the
 * project's current portfolio category). Live and already-inactive stages are unchanged.
 */
export function overlayShelved(base: LifecycleStage | string, portfolioCategory: string | null | undefined): InitiativeStage {
  if (base === "Live" || base === "Inactive") return base;
  if (portfolioCategory === "Shelved") return "Inactive";
  return base === "Evaluating" || base === "Approved" ? base : "Exploring";
}

/** Open ideas (New / Reviewing) are Intake; anything else is not on the page. */
export function isIntakeIdea(status: string): boolean {
  return status === "New" || status === "Reviewing";
}

const DAY_MS = 86_400_000;
const keyMs = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));

/** Whole tenant-local calendar days between two day keys ("2026-11-10"). */
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round((keyMs(to) - keyMs(from)) / DAY_MS);
}

/** Days in stage, counted in tenant-local calendar days; null when the entry date is unknown. */
export function daysInStage(enteredAt: string | null, now: Date, tz: string): number | null {
  if (!enteredAt) return null;
  return Math.max(0, daysBetweenKeys(dayKey(enteredAt, tz), dayKey(now, tz)));
}

/** Stuck = in a pipeline stage for more than 30 days. Unknown entry date is never stuck. */
export function isStuck(row: Pick<InitiativeRow, "stage" | "stageEnteredAt">, now: Date, tz: string): boolean {
  if (!(STUCK_STAGES as readonly string[]).includes(row.stage)) return false;
  const d = daysInStage(row.stageEnteredAt, now, tz);
  return d !== null && d > STUCK_AFTER_DAYS;
}

/** Mean days in stage over the rows whose entry date is known; null when none is. */
export function avgDaysInStage(rows: Pick<InitiativeRow, "stageEnteredAt">[], now: Date, tz: string): number | null {
  const known = rows.map((r) => daysInStage(r.stageEnteredAt, now, tz)).filter((d): d is number => d !== null);
  if (!known.length) return null;
  return Math.round(known.reduce((a, b) => a + b, 0) / known.length);
}

export function stageCounts(rows: Pick<InitiativeRow, "stage">[]): Record<InitiativeStage, number> {
  const out = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<InitiativeStage, number>;
  for (const r of rows) out[r.stage] += 1;
  return out;
}

/**
 * Change lines need four weeks of stage history: the earliest snapshot day with a stage must
 * be at least 28 days before today. Day keys are "YYYY-MM-DD".
 */
export function changeLinesReady(earliestStageDay: string | null, todayDay: string): boolean {
  if (!earliestStageDay) return false;
  return daysBetweenKeys(earliestStageDay, todayDay) >= CHANGE_HISTORY_DAYS;
}

/** "↑ 2 this week" · "↓ 1 this week" · "No change this week". */
export function changeLine(today: number, weekAgo: number): string {
  const d = today - weekAgo;
  if (d > 0) return `↑ ${d} this week`;
  if (d < 0) return `↓ ${-d} this week`;
  return "No change this week";
}

export interface StageHistory {
  /** False until 28 days of stage snapshots exist; the change lines are then omitted. */
  ready: boolean;
  /** Per-stage counts seven days ago (only when ready). */
  weekAgo: Record<CardStage, number> | null;
}

export interface LifecycleCard {
  stage: CardStage;
  count: number;
  context: string;
  /** Amber context: something has been stuck in this stage for more than 30 days. */
  contextWarn: boolean;
  /** Omitted (null) until the history is ready. */
  change: string | null;
}

const HEALTH_PARTS: [HealthBucket, string][] = [
  ["Green", "on track"],
  ["Amber", "at risk"],
  ["Red", "off track"],
];

/** The five cards, from ALL rows — they never change with the tab or the filters. */
export function lifecycleCards(rows: InitiativeRow[], now: Date, tz: string, history: StageHistory): LifecycleCard[] {
  return CARD_STAGES.map((stage) => {
    const inStage = rows.filter((r) => r.stage === stage);
    const count = inStage.length;
    let context: string;
    let contextWarn = false;
    if (stage === "Approved") {
      const parts = HEALTH_PARTS.map(([h, word]) => [inStage.filter((r) => r.health === h).length, word] as const).filter(([n]) => n > 0);
      context = count === 0 ? "Nothing approved yet" : parts.length ? parts.map(([n, w]) => `${n} ${w}`).join(" · ") : "None confirmed this week";
    } else if (stage === "Live") {
      const recent = inStage.filter((r) => {
        const d = daysInStage(r.stageEnteredAt, now, tz);
        return d !== null && d <= 90;
      }).length;
      context = count === 0 ? "Nothing live yet" : `${recent} went live in the last 90 days`;
    } else {
      const avg = avgDaysInStage(inStage, now, tz);
      const stuck = inStage.filter((r) => isStuck(r, now, tz)).length;
      const days = avg === null ? null : `${avg} ${avg === 1 ? "day" : "days"}`;
      if (count === 0) context = "Nothing in this stage";
      else if (stuck > 0) {
        // Kept short so the line never wraps: "Avg. 28 days · 1 stuck", in amber.
        context = days ? `Avg. ${days} · ${stuck} stuck` : `${stuck} stuck`;
        contextWarn = true;
      } else context = days ? `Avg. ${days} in stage` : "Days in stage not known yet";
    }
    const change = history.ready && history.weekAgo ? changeLine(count, history.weekAgo[stage]) : null;
    return { stage, count, context, contextWarn, change };
  });
}

/** "7 paused, shelved or cancelled" — the one line under the cards. */
export function inactiveLine(count: number): string {
  return count === 0 ? "Nothing paused, shelved or cancelled" : `${count} paused, shelved or cancelled`;
}

export function parseTab(raw: string | null | undefined): InitiativeTab {
  return (INITIATIVE_TABS as readonly string[]).includes(raw ?? "") ? (raw as InitiativeTab) : "all";
}

export function tabStages(tab: InitiativeTab): readonly InitiativeStage[] {
  return TAB_STAGES[tab];
}

export function rowsForTab<T extends Pick<InitiativeRow, "stage">>(rows: readonly T[], tab: InitiativeTab): T[] {
  const stages = TAB_STAGES[tab];
  return rows.filter((r) => stages.includes(r.stage));
}

export function tabCounts(rows: readonly Pick<InitiativeRow, "stage">[]): Record<InitiativeTab, number> {
  return Object.fromEntries(INITIATIVE_TABS.map((t) => [t, rowsForTab(rows, t).length])) as Record<InitiativeTab, number>;
}

/** Table order: stage (Intake → Live, then Inactive), longest in stage first, then name. */
export function sortInitiatives<T extends InitiativeRow>(rows: readonly T[], now: Date, tz: string): T[] {
  return [...rows].sort(
    (a, b) =>
      STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) ||
      (daysInStage(b.stageEnteredAt, now, tz) ?? -1) - (daysInStage(a.stageEnteredAt, now, tz) ?? -1) ||
      a.name.localeCompare(b.name),
  );
}

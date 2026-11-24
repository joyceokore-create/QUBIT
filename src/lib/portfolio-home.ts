import type { CockpitProject } from "@/server/dashboard-cockpit";
import type { DecisionBlocker } from "@/server/reports-week";
import type { WaitingSummary } from "@/server/decision-requests";
import { stageOf } from "@/lib/cockpit-gates";
import { formatDayMonth, isOverdue } from "@/lib/dates";
import { healthWord } from "@/lib/status-words";

/**
 * UX10 — Executive › Portfolio home, the pure part (UX plan D3/D4/D5, UX10). "How the approved
 * portfolio is doing, and what is waiting on the Group." Every rule here reads the cockpit's
 * CockpitProject, so the figures match the Brief, the old Executive cockpit and the workspace.
 * Client-safe.
 *
 * The approved portfolio = active projects (not Completed / Cancelled) whose portfolio is
 * Approved (the cockpit's `category`, the Head home's "Approved portfolio" rule), MINUS those
 * with priority Paused: a paused project is Inactive in the lifecycle (src/lib/lifecycle.ts,
 * D8a) and has no priority tab here, so counting it would make the tabs not add up.
 */

export type Tone = "bad" | "warn" | "ok" | "muted";

// ── priority tabs ────────────────────────────────────────────────────────

export const PRIORITY_TABS = ["high", "medium", "low", "strategic"] as const;
export type PriorityTab = (typeof PRIORITY_TABS)[number];
export const PRIORITY_TAB_LABEL: Record<PriorityTab, string> = { high: "High", medium: "Medium", low: "Low", strategic: "Strategic" };

/**
 * Project priority (High | Med | Low | New | Strat | Paused) → its tab. "New" means approved but
 * not yet prioritised: it sits under Medium — neither promoted above the High work nor buried
 * under Low — and the drawer says "New (not prioritised yet)". Paused is excluded upstream.
 */
export function priorityTab(priority: string): PriorityTab {
  if (priority === "High") return "high";
  if (priority === "Low") return "low";
  if (priority === "Strat") return "strategic";
  return "medium"; // Med, New (and any unknown value)
}

const PRIORITY_WORD: Record<string, string> = { High: "High", Med: "Medium", Low: "Low", New: "New (not prioritised yet)", Strat: "Strategic", Paused: "Paused" };
export const priorityWord = (priority: string) => PRIORITY_WORD[priority] ?? priority;

// ── the sets ─────────────────────────────────────────────────────────────

const isActive = (p: CockpitProject) => p.status !== "Completed" && p.status !== "Cancelled";
export const activeProjects = (ps: CockpitProject[]) => ps.filter(isActive);

/** Active, in an Approved portfolio, not paused. */
export function approvedPortfolio(ps: CockpitProject[]): CockpitProject[] {
  // UX10: "Approved" is the shared lifecycle stage (pipeline stage), the same as the Portfolios card.
  return ps.filter((p) => isActive(p) && p.lifecycle === "Approved");
}

/**
 * Suggested decisions — the old Executive cockpit's "Decisions needing Group action" rule
 * (exec.tsx, the Brief's exec-decisions line): an open red item, OR a status dispute past the
 * target date, OR calculated Off track with no update for more than 7 days. Across every
 * active project (as the Brief counts them), longest-waiting first. Worked out from project
 * signals, not raised by people (D5) — every surface that shows them says so.
 */
export function suggestedDecisionProjects(ps: CockpitProject[]): CockpitProject[] {
  return activeProjects(ps)
    .filter((p) => p.redRisks > 0 || (p.dispute && p.targetPassed) || (p.calculated === "R" && p.freshnessDays > 7))
    .sort((a, b) => b.freshnessDays - a.freshnessDays || a.name.localeCompare(b.name));
}

export const SUGGESTED_LABEL = "Suggested from project signals";

// ── KPIs ─────────────────────────────────────────────────────────────────

export interface PortfolioKpis {
  approved: number;
  /** By each project's reported status (the estate's display RAG). */
  byHealth: { ok: number; warn: number; bad: number; none: number };
  live: number;
  liveNames: string[];
  decisions: number;
  /** Active projects with at least one open blocker (exec.tsx's `blocked`). */
  blocked: number;
  openBlockers: number;
}

export function portfolioKpis(ps: CockpitProject[]): PortfolioKpis {
  const approved = approvedPortfolio(ps);
  const by = { ok: 0, warn: 0, bad: 0, none: 0 };
  for (const p of approved) {
    if (p.reported === "G") by.ok++;
    else if (p.reported === "A") by.warn++;
    else if (p.reported === "R") by.bad++;
    else by.none++;
  }
  const live = ps.filter((p) => p.status === "Completed");
  const blocked = activeProjects(ps).filter((p) => p.openBlockers > 0);
  return {
    approved: approved.length,
    byHealth: by,
    live: live.length,
    liveNames: live.map((p) => p.name),
    decisions: suggestedDecisionProjects(ps).length,
    blocked: blocked.length,
    openBlockers: blocked.reduce((n, p) => n + p.openBlockers, 0),
  };
}

/** "3 on track · 1 at risk · 1 off track" (zeros left out; "not rated" only when present). */
export function healthLine(by: PortfolioKpis["byHealth"]): string {
  return [by.ok && `${by.ok} on track`, by.warn && `${by.warn} at risk`, by.bad && `${by.bad} off track`, by.none && `${by.none} not rated`].filter(Boolean).join(" · ");
}

// ── "The one thing to know" ──────────────────────────────────────────────

export interface OneThing {
  text: string;
  tone: Tone;
  /** Lower = more urgent (the rule's position). */
  rank: number;
}

const LONG: Record<string, string> = { G: "Green", A: "Amber", R: "Red" };
const word = (r: string) => (LONG[r] ? healthWord(LONG[r]).toLowerCase() : "not rated");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * One line per project, worked out deterministically from its signals — never generated.
 * The FIRST rule that matches wins (most serious first):
 *   1. an open red item            → "Open red item: <title>"
 *   2. the next milestone overdue  → "<milestone> overdue since <d Mon>" (tenant calendar)
 *   3. past its target date        → "Past its target date (<d Mon>)"
 *   4. open blockers               → "2 open blockers"
 *   5. a status dispute            → "Reported on track, calculates at risk"
 *   6. no update for 14+ days      → "No update for 21 days" / "No update yet"
 *   7. no confirmed check-in this week → "No check-in this week"
 *   8. confirmed this week         → "Confirmed on track" (or "Confirmed at risk" …)
 */
export function oneThingToKnow(p: CockpitProject, now: Date, tz: string): OneThing {
  const red = p.risks.find((r) => r.severity === "R");
  if (red) return { text: `Open red item: ${red.title}`, tone: "bad", rank: 1 };
  const ms = p.nextMilestone;
  if (ms?.dueDate && isOverdue(ms.dueDate, now, tz)) return { text: `${ms.name} overdue since ${formatDayMonth(ms.dueDate, tz)}`, tone: "bad", rank: 2 };
  if (p.targetPassed) return { text: p.dueDate ? `Past its target date (${formatDayMonth(p.dueDate, tz)})` : "Past its target date", tone: "bad", rank: 3 };
  if (p.openBlockers > 0) return { text: plural(p.openBlockers, "open blocker", "open blockers"), tone: "warn", rank: 4 };
  if (p.dispute) return { text: `Reported ${word(p.reported)}, calculates ${word(p.calculated)}`, tone: "warn", rank: 5 };
  if (p.freshnessDays >= 900) return { text: "No update yet", tone: "warn", rank: 6 };
  if (p.freshnessDays > 14) return { text: `No update for ${p.freshnessDays} days`, tone: "warn", rank: 6 };
  if (!p.reportedConfirmed) return { text: "No check-in this week", tone: "muted", rank: 7 };
  return { text: `Confirmed ${word(p.reported)}`, tone: p.reported === "G" ? "ok" : "muted", rank: 8 };
}

// ── the main list ────────────────────────────────────────────────────────

export interface PortfolioRow {
  id: string;
  name: string;
  code: string;
  portfolio: string;
  stage: string;
  phase: string;
  reported: CockpitProject["reported"];
  tab: PriorityTab;
  oneThing: OneThing;
}

const HEALTH_ORDER: Record<string, number> = { R: 0, A: 1, G: 2, N: 3 };

/** The approved portfolio as table rows: worst reported health first, then the most urgent
 * "one thing", then name. */
export function portfolioRows(ps: CockpitProject[], now: Date, tz: string): PortfolioRow[] {
  return approvedPortfolio(ps)
    .map((p) => {
      const { phase, stage } = stageOf(p);
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        portfolio: p.portfolioName ?? "Unassigned",
        stage,
        phase,
        reported: p.reported,
        tab: priorityTab(p.priority),
        oneThing: oneThingToKnow(p, now, tz),
      };
    })
    .sort((a, b) => HEALTH_ORDER[a.reported]! - HEALTH_ORDER[b.reported]! || a.oneThing.rank - b.oneThing.rank || a.name.localeCompare(b.name));
}

export function tabCounts(rows: PortfolioRow[]): Record<PriorityTab, number> {
  const out: Record<PriorityTab, number> = { high: 0, medium: 0, low: 0, strategic: 0 };
  for (const r of rows) out[r.tab]++;
  return out;
}

// ── side panel ───────────────────────────────────────────────────────────

export interface SuggestedDecision {
  projectId: string;
  projectName: string;
  why: string;
  owner: string;
  waiting: string;
  href: string;
}

/** Why the rule picked the project, in the order the rule reads. */
export function suggestedDecisions(ps: CockpitProject[], limit = 3): SuggestedDecision[] {
  return suggestedDecisionProjects(ps)
    .slice(0, limit)
    .map((p) => {
      const red = p.risks.find((r) => r.severity === "R");
      const why = red
        ? `Open red item: ${red.title}`
        : p.dispute && p.targetPassed
          ? `Past target; reported ${word(p.reported)}, calculates ${word(p.calculated)}`
          : p.freshnessDays >= 900
            ? "Calculates off track; no update yet"
            : `Calculates off track; no update for ${p.freshnessDays} days`;
      return {
        projectId: p.id,
        projectName: p.name,
        why,
        owner: p.pmName ? `PM ${p.pmName}` : "No PM",
        waiting: p.freshnessDays >= 900 ? "No update yet" : `${plural(p.freshnessDays, "day", "days")} since an update`,
        href: `/projects/${p.id}?tab=${red ? "Register" : "Delivery"}`,
      };
    });
}

export interface TopRisk {
  key: string;
  title: string;
  projectId: string;
  projectName: string;
  owner: string;
}

/** The top red items across active projects (the old cockpit's "Top risks"), first N. */
export function topRisks(ps: CockpitProject[], limit = 2): TopRisk[] {
  return activeProjects(ps)
    .flatMap((p) => p.risks.filter((r) => r.severity === "R").map((r) => ({ key: `${p.id}-${r.id}`, title: r.title, projectId: p.id, projectName: p.name, owner: r.owner })))
    .slice(0, limit);
}

// ── drawer / server payload ──────────────────────────────────────────────

export interface PortfolioHomeExtras {
  /** The real "Blockers needing a decision" (Reports › This week); null = viewer can't read reports. */
  decisionBlockers: DecisionBlocker[] | null;
  /** WS2 — the real decisions waiting on the Group: count, the first three, and per project
   * the soonest-due one (the summary drawer's "Go to the Decision"). */
  decisions: WaitingSummary;
  /** Per project: the next pending milestones (ISO dates), soonest first. */
  nextMilestones: Record<string, { id: string; name: string; dueDate: string | null }[]>;
  /** Per project: the latest PM-confirmed check-in line. */
  lastLine: Record<string, { line: string; isoWeek: string; confirmedAt: string | null }>;
}

/** The drawer's health sentence: what's reported, where it comes from, and any dispute. */
export function healthSentence(p: CockpitProject): string {
  const src = p.reportedConfirmed ? "confirmed by the PM this week" : "from the project status (no confirmed check-in this week)";
  const head = p.reported === "N" ? `Not rated, ${src}` : `Reported ${word(p.reported)}, ${src}`;
  return p.dispute ? `${head}. QUBIT calculates ${word(p.calculated)}.` : `${head}.`;
}

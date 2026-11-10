import type { CockpitProject } from "@/server/dashboard-cockpit";
import { GATE_LABELS } from "@/lib/cockpit-gates";
import { healthWord } from "@/lib/status-words";

/**
 * UX8 — Head › Delivery health, the pure part (UX plan D3/D4/D5, UX8). Exceptions only, across
 * every project: gates (Suggested from project signals until gate approvals exist, UX13),
 * status disputes, stale updates and escalations — each with the SAME rule as the figures the
 * Head saw before (head.tsx), so nothing changes meaning. Client-safe.
 */

export const DECISION_TABS = ["gates", "disputes", "stale", "escalations"] as const;
export type DecisionTab = (typeof DECISION_TABS)[number];
export const DECISION_TAB_LABEL: Record<DecisionTab, string> = { gates: "Gates", disputes: "Disputes", stale: "Stale", escalations: "Escalations" };

export type Tone = "bad" | "warn" | "info" | "muted";

export interface DecisionItem {
  id: string;
  tab: DecisionTab;
  projectId: string;
  title: string;
  sub: string;
  chip: { tone: Tone; label: string };
  when: string;
  action: { kind: "link"; label: string; href: string } | { kind: "nudge"; label: string; projectId: string };
  rank: number;
}

/** Days without a check-in before an update counts as stale (the Brief and the KPI agree). */
export const STALE_DAYS = 14;

const LONG: Record<string, string> = { G: "Green", A: "Amber", R: "Red" };
const word = (r: string) => (LONG[r] ? healthWord(LONG[r]) : "not rated");
const href = (id: string, tab?: string) => `/projects/${id}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`;
const active = (ps: CockpitProject[]) => ps.filter((p) => !["Completed", "Cancelled"].includes(p.status));
const pm = (p: CockpitProject) => (p.pmName ? `PM ${p.pmName}` : "No PM");

/** Gates in play — the old cockpit's "Gate approvals waiting" rule: the Go-Live gate is live. */
export function gatesInPlay(ps: CockpitProject[]): CockpitProject[] {
  return active(ps).filter((p) => ["prog", "late", "block"].includes(p.gates.golive));
}
export function staleProjects(ps: CockpitProject[]): CockpitProject[] {
  return active(ps)
    .filter((p) => p.freshnessDays > STALE_DAYS && p.freshnessDays < 900)
    .sort((a, b) => b.freshnessDays - a.freshnessDays);
}
/** The old "To escalate upward" rule: a red item, or past target and not Green. */
export function escalations(ps: CockpitProject[]): CockpitProject[] {
  return active(ps).filter((p) => p.redRisks > 0 || (p.targetPassed && p.calculated !== "G"));
}

export function buildDecisions(ps: CockpitProject[]): DecisionItem[] {
  const items: DecisionItem[] = [];

  for (const p of gatesInPlay(ps)) {
    const state = p.gates.golive;
    items.push({
      id: `gate-${p.id}`,
      tab: "gates",
      projectId: p.id,
      title: `${p.name} · ${GATE_LABELS.golive} readiness`,
      sub: `${pm(p)} · Suggested from project signals`,
      chip: state === "block" ? { tone: "bad", label: "Blocked" } : state === "late" ? { tone: "warn", label: "Behind" } : { tone: "info", label: "In progress" },
      when: "",
      action: { kind: "link", label: "Open", href: href(p.id, "Delivery") },
      rank: state === "block" ? 0 : state === "late" ? 1 : 2,
    });
  }

  for (const p of active(ps).filter((x) => x.dispute)) {
    items.push({
      id: `dispute-${p.id}`,
      tab: "disputes",
      projectId: p.id,
      title: `${p.name}: reported ${word(p.reported)}, calculates ${word(p.calculated)}`,
      sub: `${pm(p)} · check whether it's under-reported`,
      chip: { tone: "warn", label: "Dispute" },
      when: "",
      action: { kind: "link", label: "Open", href: href(p.id, "This week") },
      rank: 10,
    });
  }

  for (const p of staleProjects(ps)) {
    items.push({
      id: `stale-${p.id}`,
      tab: "stale",
      projectId: p.id,
      title: `${p.name}: no check-in for ${p.freshnessDays} days`,
      sub: pm(p),
      chip: { tone: p.freshnessDays > 30 ? "bad" : "warn", label: "Stale" },
      when: `${p.freshnessDays} days`,
      action: { kind: "nudge", label: "Chase", projectId: p.id },
      rank: 20 - Math.min(p.freshnessDays, 19) / 20,
    });
  }

  for (const p of escalations(ps)) {
    const red = p.risks.find((r) => r.severity === "R");
    items.push({
      id: `esc-${p.id}`,
      tab: "escalations",
      projectId: p.id,
      title: p.name,
      sub: red ? `Open red item: ${red.title}` : "Past its target date and not on track",
      chip: { tone: "bad", label: "Escalate" },
      when: "",
      action: { kind: "link", label: "Open", href: href(p.id, red ? "Register" : "Delivery") },
      rank: 30,
    });
  }

  return items.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
}

export interface HeadKpis {
  approved: number;
  byHealth: { ok: number; warn: number; bad: number; none: number };
  gates: number;
  stale: number;
  disputes: number;
}

export function headKpis(ps: CockpitProject[]): HeadKpis {
  const live = active(ps);
  const approved = live.filter((p) => p.category === "Approved");
  const by = { ok: 0, warn: 0, bad: 0, none: 0 };
  for (const p of approved) {
    if (p.reported === "G") by.ok++;
    else if (p.reported === "A") by.warn++;
    else if (p.reported === "R") by.bad++;
    else by.none++;
  }
  return {
    approved: approved.length,
    byHealth: by,
    gates: gatesInPlay(ps).length,
    stale: staleProjects(ps).length,
    disputes: live.filter((p) => p.dispute).length,
  };
}

export interface PmLoad {
  id: string;
  name: string;
  projects: number;
  red: number;
  amber: number;
}

/** Projects per PM (lead or PM member), worst first. */
export function pmLoad(ps: CockpitProject[], pms: { id: string; name: string }[]): PmLoad[] {
  const live = active(ps);
  // One row per person, even if they appear more than once in the input.
  const unique = [...new Map(pms.map((m) => [m.id, m])).values()];
  return unique
    .map((m) => {
      const mine = live.filter((p) => p.pmIds.includes(m.id));
      return {
        id: m.id,
        name: m.name,
        projects: mine.length,
        red: mine.filter((p) => p.reported === "R").length,
        amber: mine.filter((p) => p.reported === "A").length,
      };
    })
    .filter((l) => l.projects > 0)
    .sort((a, b) => b.red - a.red || b.amber - a.amber || b.projects - a.projects || a.name.localeCompare(b.name));
}

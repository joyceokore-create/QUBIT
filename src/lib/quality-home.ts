import { dayKey, formatDayMonth } from "@/lib/dates";
import type { GateQueueItem } from "@/lib/gate-approval";

/**
 * UX9 — Head of QA › Quality home, the pure part (UX plan D3, UX9): the quality queue
 * (testing gates · critical issues · unassigned test tasks · overdue test tasks), its tabs and
 * the four KPI figures. Built from `QualityOverview` (src/server/quality.ts). Client-safe.
 * WS1 (Tier 4): the Testing Gates tab and the "Testing Gates Waiting" KPI list REAL testing
 * gates submitted for sign-off (the engine's approver lens), not gates inferred from state.
 */

export interface QhProject {
  id: string;
  name: string;
  pmName: string | null;
  testingGates: { key: string; label: string; state: "prog" | "late" | "block" }[];
  inTesting: boolean;
  coveragePct: number | null;
  criticalOpen: number;
  overdueTests: number;
}
export interface QhCritical {
  id: string;
  kind: "bug" | "issue";
  title: string;
  projectId: string;
  projectName: string;
  owner: string | null;
  openedAt: Date;
}
export interface QhTest {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  dueDate: Date | null;
  assignee: string | null;
}
export interface QhData {
  timeZone: string;
  projects: QhProject[];
  critical: QhCritical[];
  unassigned: QhTest[];
  overdue: QhTest[];
}

// Design spec v2 (Quality Home): three tabs. Unassigned and overdue test tasks share the
// third tab (their chips say which), so neither drops off the home page.
export const QH_TABS = ["gates", "critical", "tasks"] as const;
export type QhTab = (typeof QH_TABS)[number];
export const QH_TAB_LABEL: Record<QhTab, string> = { gates: "Testing Gates", critical: "Critical Issues", tasks: "Test Tasks" };

export type Tone = "bad" | "warn" | "info" | "ok" | "muted";
export interface QhItem {
  id: string;
  tab: QhTab;
  title: string;
  sub: string;
  chip: { tone: Tone; label: string };
  when: string;
  href: string;
  /** WS1 — a gate row opens the sign-off drawer in place instead of navigating. */
  gate?: { projectId: string; statusId: string };
}

const DAY = 86_400_000;
const daysSince = (d: Date, now: Date, tz: string) => Math.max(0, Math.round((Date.parse(`${dayKey(now, tz)}T00:00:00Z`) - Date.parse(`${dayKey(d, tz)}T00:00:00Z`)) / DAY));
const taskHref = (projectId: string, id: string) => `/projects/${projectId}?tab=Board&task=${id}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Testing gates waiting for sign-off (submitted; testing gates only — the HQA scope). */
export function waitingTestingGates(gates: readonly GateQueueItem[]): GateQueueItem[] {
  return gates.filter((g) => g.testing && g.approval === "submitted");
}

export function buildQueue(d: QhData, now: Date, gates: readonly GateQueueItem[] = []): QhItem[] {
  const tz = d.timeZone;
  const items: QhItem[] = [];

  for (const g of waitingTestingGates(gates)) {
    const p = d.projects.find((x) => x.id === g.projectId);
    const blockedBy = p?.criticalOpen ?? 0;
    const age = g.submittedAt ? daysSince(new Date(g.submittedAt), now, tz) : 0;
    items.push({
      id: `gate-${g.statusId}`,
      tab: "gates",
      title: `${g.projectName} · ${g.gateName}${g.marketName ? ` (${g.marketName})` : ""}`,
      sub: [
        "Pass rate not tracked",
        blockedBy ? plural(blockedBy, "critical issue open", "critical issues open") : "no critical issues",
        p && p.coveragePct !== null ? `${p.coveragePct}% of requirements have tests` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      chip: blockedBy ? { tone: "warn", label: `Blocked by ${blockedBy}` } : { tone: "ok", label: "Ready" },
      when: age === 0 ? "today" : `${age}d`,
      href: `/projects/${g.projectId}?tab=Delivery`,
      gate: { projectId: g.projectId, statusId: g.statusId },
    });
  }

  for (const c of d.critical) {
    const age = daysSince(c.openedAt, now, tz);
    items.push({
      id: `crit-${c.kind}-${c.id}`,
      tab: "critical",
      title: c.title,
      sub: `${c.projectName} · ${c.kind === "bug" ? "Bug" : "Issue"}${c.owner ? ` · ${c.owner}` : " · no owner"}`,
      chip: { tone: "bad", label: "Critical" },
      when: age === 0 ? "today" : `${age} ${age === 1 ? "day" : "days"}`,
      href: c.kind === "bug" ? taskHref(c.projectId, c.id) : `/projects/${c.projectId}?tab=Register`,
    });
  }

  for (const t of d.unassigned) {
    items.push({
      id: `un-${t.id}`,
      tab: "tasks",
      title: t.title,
      sub: t.projectName,
      chip: { tone: "warn", label: "Unassigned" },
      when: t.dueDate ? `due ${formatDayMonth(t.dueDate, tz)}` : "",
      href: taskHref(t.projectId, t.id),
    });
  }

  for (const t of d.overdue) {
    const late = daysSince(t.dueDate!, now, tz);
    items.push({
      id: `od-${t.id}`,
      tab: "tasks",
      title: t.title,
      sub: `${t.projectName}${t.assignee ? ` · ${t.assignee}` : " · unassigned"}`,
      chip: { tone: "bad", label: `${late} ${late === 1 ? "day" : "days"} late` },
      when: `was ${formatDayMonth(t.dueDate!, tz)}`,
      href: taskHref(t.projectId, t.id),
    });
  }
  return items;
}

export interface QhKpis {
  inTesting: number;
  /** WS1 — testing gates waiting for sign-off, and how many of those critical issues hold. */
  testingGates: number;
  gatesBlocked: number;
  criticalOpen: number;
  criticalProjects: number;
  overdueTests: number;
  overdueProjects: number;
}

export function qhKpis(d: QhData, waitingGates: readonly GateQueueItem[] = []): QhKpis {
  const gates = waitingTestingGates(waitingGates);
  const critical = new Map(d.projects.map((p) => [p.id, p.criticalOpen]));
  return {
    inTesting: d.projects.filter((p) => p.inTesting).length,
    testingGates: gates.length,
    gatesBlocked: gates.filter((g) => (critical.get(g.projectId) ?? 0) > 0).length,
    // Uncapped per-project counts (the critical list itself is capped for display).
    criticalOpen: d.projects.reduce((n, p) => n + p.criticalOpen, 0),
    criticalProjects: d.projects.filter((p) => p.criticalOpen > 0).length,
    overdueTests: d.overdue.length,
    overdueProjects: new Set(d.overdue.map((t) => t.projectId)).size,
  };
}

/** Coverage, lowest first (only projects that track requirements). */
export function coverageList(d: QhData): { id: string; name: string; pct: number }[] {
  return d.projects
    .filter((p): p is QhProject & { coveragePct: number } => p.coveragePct !== null)
    .map((p) => ({ id: p.id, name: p.name, pct: p.coveragePct }))
    .sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));
}

/** The Risks & Issues "open critical" preset (UX9). */
export const OPEN_CRITICAL_HREF = "/risks?tab=issues&severity=Critical&status=Open";

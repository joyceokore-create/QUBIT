import { dayKey, formatDayMonth } from "@/lib/dates";

/**
 * UX9 — Head of QA › Quality home, the pure part (UX plan D3, UX9): the quality queue
 * (testing gates · critical issues · unassigned test tasks · overdue test tasks), its tabs and
 * the four KPI figures. Built from `QualityOverview` (src/server/quality.ts). Client-safe.
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

export const QH_TABS = ["gates", "critical", "unassigned", "overdue"] as const;
export type QhTab = (typeof QH_TABS)[number];
export const QH_TAB_LABEL: Record<QhTab, string> = { gates: "Testing gates", critical: "Critical issues", unassigned: "Unassigned test tasks", overdue: "Overdue test tasks" };

export type Tone = "bad" | "warn" | "info" | "ok" | "muted";
export interface QhItem {
  id: string;
  tab: QhTab;
  title: string;
  sub: string;
  chip: { tone: Tone; label: string };
  when: string;
  href: string;
}

const DAY = 86_400_000;
const daysSince = (d: Date, now: Date, tz: string) => Math.max(0, Math.round((Date.parse(`${dayKey(now, tz)}T00:00:00Z`) - Date.parse(`${dayKey(d, tz)}T00:00:00Z`)) / DAY));
const taskHref = (projectId: string, id: string) => `/projects/${projectId}?tab=Board&task=${id}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildQueue(d: QhData, now: Date): QhItem[] {
  const tz = d.timeZone;
  const items: QhItem[] = [];

  for (const p of d.projects) {
    for (const g of p.testingGates) {
      const blockedBy = p.criticalOpen;
      items.push({
        id: `gate-${p.id}-${g.key}`,
        tab: "gates",
        title: `${p.name} · ${g.label}`,
        sub: [blockedBy ? plural(blockedBy, "critical issue open", "critical issues open") : "No critical issues open", p.coveragePct !== null ? `${p.coveragePct}% of requirements have tests` : "No requirements tracked"].join(" · "),
        chip:
          g.state === "block"
            ? { tone: "bad", label: "Blocked" }
            : blockedBy
              ? { tone: "warn", label: `Blocked by ${blockedBy}` }
              : g.state === "late"
                ? { tone: "warn", label: "Behind" }
                : { tone: "ok", label: "No blockers" },
        when: p.pmName ? `PM ${p.pmName}` : "",
        href: `/projects/${p.id}?tab=Delivery`,
      });
    }
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
      tab: "unassigned",
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
      tab: "overdue",
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
  testingGates: number;
  gatesBlocked: number;
  criticalOpen: number;
  criticalProjects: number;
  overdueTests: number;
  overdueProjects: number;
}

export function qhKpis(d: QhData): QhKpis {
  const gates = d.projects.flatMap((p) => p.testingGates.map((g) => ({ g, p })));
  return {
    inTesting: d.projects.filter((p) => p.inTesting).length,
    testingGates: gates.length,
    gatesBlocked: gates.filter(({ g, p }) => g.state === "block" || p.criticalOpen > 0).length,
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

import { dayKey, formatDayMonth } from "@/lib/dates";
import { healthWord } from "@/lib/status-words";

/**
 * UX7 — PM › Today, the pure part: one list of what needs the PM, most urgent first, with
 * tabs and the four KPI figures. "Late" and "Friday 17:00" are tenant-local (U5). Client-safe.
 */

export type DimRag = "G" | "A" | "R" | "N";

export interface PmTodayProject {
  id: string;
  name: string;
  code: string;
  /** What's reported this week (confirmed check-in, else the typed status). */
  reported: DimRag;
  /** What QUBIT calculates from the project's signals. */
  calculated: DimRag;
  /** Reported greener than calculated. */
  dispute: boolean;
  /** Why it calculates what it does, in plain words. */
  reasons: string[];
  pct: number;
  nextMilestone: { name: string; dueDate: Date | null } | null;
  /** This week's status update: none, draft saved, confirmed (not sent), sent to the Head. */
  update: "none" | "draft" | "confirmed" | "sent";
  gates: { key: string; label: string; state: "blocked" | "late" }[];
  redItems: { title: string; owner: string }[];
  overdueTasks: number;
}

export interface PmToday {
  timeZone: string;
  projects: PmTodayProject[];
  overdueMilestones: { id: string; name: string; dueDate: Date; projectId: string; projectName: string }[];
  milestonesNext7: number;
  /** Milestones due on each of the next 7 days, today first (KPI bars). */
  milestonesNext7PerDay: number[];
  blockers: {
    id: string;
    description: string;
    since: Date;
    projectId: string;
    projectName: string;
    taskId: string | null;
    taskTitle: string | null;
    raisedBy: string | null;
    unblocker: string | null;
  }[];
  clashes: { name: string; pct: number; projects: string[] }[];
}

export const TODO_KINDS = ["overdue", "blocker", "update", "gate", "dispute", "risk"] as const;
export type TodoKind = (typeof TODO_KINDS)[number];
export type Tone = "bad" | "warn" | "info" | "muted";

export interface TodoItem {
  id: string;
  kind: TodoKind;
  title: string;
  sub: string;
  chip: { tone: Tone; label: string };
  when: string;
  /** What the row's button does: open a drawer here, or go to a page. */
  action:
    | { kind: "milestone"; label: string; milestoneId: string }
    | { kind: "dispute"; label: string; projectId: string }
    | { kind: "link"; label: string; href: string; primary?: boolean };
  /** Sort key inside the list: lower first. */
  rank: number;
}

const DAY = 86_400_000;
const RAG_LONG: Record<DimRag, string> = { G: "Green", A: "Amber", R: "Red", N: "" };
const word = (r: DimRag) => (r === "N" ? "not rated" : healthWord(RAG_LONG[r]));

export function daysLate(due: Date, now: Date, tz: string): number {
  return Math.round((Date.parse(`${dayKey(now, tz)}T00:00:00Z`) - Date.parse(`${dayKey(due, tz)}T00:00:00Z`)) / DAY);
}

/** From Friday 17:00 (tenant time) to the week's end, an unsent update is late. */
export function updatesLate(now: Date, tz: string): boolean {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const wd = p.weekday as string;
  return wd === "Sat" || wd === "Sun" || (wd === "Fri" && Number(p.hour) >= 17);
}

const projectHref = (id: string, tab?: string) => `/projects/${id}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`;

/** The one list, most urgent first (UX7): overdue milestones → blockers raised by the team →
 * updates not sent → gates → rating disputes → red items. */
export function buildTodo(t: PmToday, now: Date): TodoItem[] {
  const tz = t.timeZone;
  const items: TodoItem[] = [];
  const late = updatesLate(now, tz);

  for (const m of t.overdueMilestones) {
    const d = daysLate(m.dueDate, now, tz);
    items.push({
      id: `ms-${m.id}`,
      kind: "overdue",
      title: `Milestone overdue: ${m.name}`,
      sub: m.projectName,
      chip: { tone: "bad", label: `${d} ${d === 1 ? "day" : "days"} late` },
      when: `was ${formatDayMonth(m.dueDate, tz)}`,
      action: { kind: "milestone", label: "Update", milestoneId: m.id },
      rank: 1000 - Math.min(d, 999),
    });
  }

  for (const b of t.blockers) {
    items.push({
      id: `bl-${b.id}`,
      kind: "blocker",
      title: `Blocked: ${b.taskTitle ?? b.description}`,
      sub: `${b.projectName}${b.raisedBy ? ` · raised by ${b.raisedBy}` : ""}${b.unblocker ? ` · ${b.unblocker} can unblock` : ""}`,
      chip: { tone: "bad", label: "Blocked" },
      when: `since ${formatDayMonth(b.since, tz)}`,
      action: { kind: "link", label: "Open", href: b.taskId ? `/projects/${b.projectId}?tab=Board&task=${b.taskId}` : projectHref(b.projectId, "Register") },
      rank: 2000 + b.since.getTime() / 1e13,
    });
  }

  for (const p of t.projects) {
    if (p.update === "sent") continue;
    items.push({
      id: `up-${p.id}`,
      kind: "update",
      title: `Update not sent: ${p.name}`,
      sub: p.update === "draft" ? "Draft saved, not confirmed" : p.update === "confirmed" ? "Confirmed, not sent to the Head" : "Drafted from the board and the markets",
      chip: late ? { tone: "bad", label: "Late" } : { tone: "info", label: "Due Fri" },
      when: "Fri 17:00",
      // Row actions are compact secondary buttons: a page has one primary (U3).
      action: { kind: "link", label: "Confirm & send", href: projectHref(p.id, "This week") },
      rank: late ? 1500 : 3000,
    });
  }

  for (const p of t.projects) {
    for (const g of p.gates) {
      items.push({
        id: `gt-${p.id}-${g.key}`,
        kind: "gate",
        title: g.state === "blocked" ? `Gate blocked: ${g.label}` : `Gate behind: ${g.label}`,
        sub: g.state === "blocked" ? p.name : `${p.name} · in progress past the target date`,
        chip: g.state === "blocked" ? { tone: "bad", label: "Blocked" } : { tone: "warn", label: "Behind" },
        when: "",
        action: { kind: "link", label: "Open", href: projectHref(p.id, "Delivery") },
        rank: g.state === "blocked" ? 4000 : 4500,
      });
    }
  }

  for (const p of t.projects.filter((x) => x.dispute)) {
    items.push({
      id: `dp-${p.id}`,
      kind: "dispute",
      title: `Status dispute: you report ${word(p.reported)}, QUBIT calculates ${word(p.calculated)}`,
      sub: p.name,
      chip: { tone: "warn", label: "Dispute" },
      when: "",
      action: { kind: "dispute", label: "Resolve", projectId: p.id },
      rank: 5000,
    });
  }

  for (const p of t.projects) {
    p.redItems.forEach((r, i) => {
      items.push({
        id: `rk-${p.id}-${i}`,
        kind: "risk",
        title: `Red risk: ${r.title}`,
        sub: `${p.name}${r.owner && r.owner !== "—" ? ` · ${r.owner}` : ""}`,
        chip: { tone: "bad", label: "Red" },
        when: "",
        action: { kind: "link", label: "Review", href: projectHref(p.id, "Register") },
        rank: 6000 + i,
      });
    });
  }

  return items.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
}

// Design spec v2 (PM › Today): All · Overdue · Gates · Updates · Risks. A status dispute is
// part of the weekly update, so it sits under Updates; a team blocker under Risks.
export const TODO_TABS = ["all", "overdue", "gates", "updates", "risks"] as const;
export type TodoTab = (typeof TODO_TABS)[number];
const TAB_KINDS: Record<Exclude<TodoTab, "all">, TodoKind[]> = {
  overdue: ["overdue"],
  gates: ["gate"],
  updates: ["update", "dispute"],
  risks: ["risk", "blocker"],
};
const TAB_LABEL: Record<TodoTab, string> = { all: "All", overdue: "Overdue", gates: "Gates", updates: "Updates", risks: "Risks" };

export function todoTabs(items: TodoItem[]): { key: TodoTab; label: string; count: number }[] {
  return TODO_TABS.map((key) => ({
    key,
    label: TAB_LABEL[key],
    count: key === "all" ? items.length : items.filter((i) => TAB_KINDS[key].includes(i.kind)).length,
  }));
}

export function itemsForTab(items: TodoItem[], tab: TodoTab): TodoItem[] {
  return tab === "all" ? items : items.filter((i) => TAB_KINDS[tab].includes(i.kind));
}

export interface PmKpis {
  projects: number;
  byHealth: { ok: number; warn: number; bad: number; none: number };
  dueNext7: number;
  overdueMilestones: number;
  overdueTasks: number;
  updatesSent: number;
  updatesDrafted: number;
  dueNext7PerDay: number[];
}

export function pmKpis(t: PmToday): PmKpis {
  const by = { ok: 0, warn: 0, bad: 0, none: 0 };
  for (const p of t.projects) {
    if (p.reported === "G") by.ok++;
    else if (p.reported === "A") by.warn++;
    else if (p.reported === "R") by.bad++;
    else by.none++;
  }
  return {
    projects: t.projects.length,
    byHealth: by,
    dueNext7: t.milestonesNext7,
    overdueMilestones: t.overdueMilestones.length,
    overdueTasks: t.projects.reduce((s, p) => s + p.overdueTasks, 0),
    updatesSent: t.projects.filter((p) => p.update === "sent").length,
    updatesDrafted: t.projects.filter((p) => p.update === "draft" || p.update === "confirmed").length,
    dueNext7PerDay: t.milestonesNext7PerDay ?? [],
  };
}

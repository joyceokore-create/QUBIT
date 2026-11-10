import { dayKey } from "@/lib/dates";

/**
 * UX6 — Member › My work, the pure part: types, the due-date groups, tabs and KPI figures.
 * "Today", "overdue" and "this week" are tenant-local days (U5). Client-safe.
 */

export interface MyTask {
  id: string;
  title: string;
  /** YouTrack key when mirrored, else QUBIT's task key. */
  key: string | null;
  projectId: string;
  projectName: string;
  status: string;
  type: string;
  priority: string;
  severity: string | null;
  dueDate: Date | null;
  estimate: string | null;
  description: string | null;
  milestone: string | null;
  /** The task in YouTrack (where its status is changed). */
  externalUrl: string | null;
  /** The person's role on the task's project ("Developer", "QA", "Project Lead"…). */
  role: string | null;
  /** A bug this person reported but isn't assigned (the "Issues I raised" tab). */
  raisedByMe: boolean;
  blocker: { id: string; description: string; since: Date; unblocker: string | null } | null;
}

export interface MyBlocker {
  id: string;
  description: string;
  since: Date;
  unblocker: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string;
  projectName: string;
}

export interface MyProject {
  id: string;
  code: string;
  name: string;
  role: string | null;
  openTasks: number;
  /** This week's confirmed check-in, or null (no report). */
  health: "Green" | "Amber" | "Red" | null;
  pmNames: string[];
  /** Who can unblock: the project's people (PMs first), excluding the viewer. */
  people: { id: string; label: string }[];
}

export interface MyWork {
  timeZone: string;
  tasks: MyTask[];
  raised: MyTask[];
  blockers: MyBlocker[];
  projects: MyProject[];
  done: { thisWeek: number; lastWeek: number };
  /** Open tasks on your projects whose YouTrack assignee matched no QUBIT account. */
  unmatched: { count: number; names: string[] };
}

export const DUE_GROUPS = ["overdue", "today", "week", "later", "none"] as const;
export type DueGroup = (typeof DUE_GROUPS)[number];
export const DUE_GROUP_LABEL: Record<DueGroup, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  none: "No due date",
};

/** The tenant-local Sunday ending `now`'s ISO week, as a day key. */
export function weekEndKey(now: Date, tz: string): string {
  const today = dayKey(now, tz);
  const noon = new Date(`${today}T12:00:00Z`);
  const dow = noon.getUTCDay() || 7; // 1 Mon … 7 Sun
  return new Date(noon.getTime() + (7 - dow) * 86_400_000).toISOString().slice(0, 10);
}

export function dueGroupOf(due: Date | null, now: Date, tz: string): DueGroup {
  if (!due) return "none";
  const d = dayKey(due, tz);
  const today = dayKey(now, tz);
  if (d < today) return "overdue";
  if (d === today) return "today";
  return d <= weekEndKey(now, tz) ? "week" : "later";
}

export function groupByDue(tasks: MyTask[], now: Date, tz: string): { group: DueGroup; tasks: MyTask[] }[] {
  const by = new Map<DueGroup, MyTask[]>(DUE_GROUPS.map((g) => [g, []]));
  for (const t of tasks) by.get(dueGroupOf(t.dueDate, now, tz))!.push(t);
  return DUE_GROUPS.map((group) => ({ group, tasks: by.get(group)! })).filter((g) => g.tasks.length > 0);
}

export const MY_TABS = ["all", "overdue", "today", "blocked", "raised"] as const;
export type MyTab = (typeof MY_TABS)[number];

/** Tabs with counts. "Issues I raised" shows for anyone with a QA role or open bugs they raised. */
export function myTabs(work: Pick<MyWork, "tasks" | "raised" | "projects">, now: Date, tz: string): { key: MyTab; label: string; count: number }[] {
  const tabs: { key: MyTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: work.tasks.length },
    { key: "overdue", label: "Overdue", count: work.tasks.filter((t) => dueGroupOf(t.dueDate, now, tz) === "overdue").length },
    { key: "today", label: "Today", count: work.tasks.filter((t) => dueGroupOf(t.dueDate, now, tz) === "today").length },
    { key: "blocked", label: "Blocked", count: work.tasks.filter((t) => t.blocker).length },
  ];
  const qa = work.projects.some((p) => p.role === "QA");
  if (qa || work.raised.length) tabs.push({ key: "raised", label: "Issues I raised", count: work.raised.length });
  return tabs;
}

export function tasksForTab(work: Pick<MyWork, "tasks" | "raised">, tab: MyTab, now: Date, tz: string): MyTask[] {
  switch (tab) {
    case "overdue":
      return work.tasks.filter((t) => dueGroupOf(t.dueDate, now, tz) === "overdue");
    case "today":
      return work.tasks.filter((t) => dueGroupOf(t.dueDate, now, tz) === "today");
    case "blocked":
      return work.tasks.filter((t) => t.blocker);
    case "raised":
      return work.raised;
    default:
      return work.tasks;
  }
}

export interface MyKpis {
  dueThisWeek: number;
  dueToday: number;
  overdue: number;
  blocked: number;
  firstBlocker: string | null;
  doneThisWeek: number;
  doneChange: number;
}

export function myKpis(work: Pick<MyWork, "tasks" | "done">, now: Date, tz: string): MyKpis {
  const groups = work.tasks.map((t) => dueGroupOf(t.dueDate, now, tz));
  const blocked = work.tasks.filter((t) => t.blocker);
  return {
    dueThisWeek: groups.filter((g) => g === "today" || g === "week").length,
    dueToday: groups.filter((g) => g === "today").length,
    overdue: groups.filter((g) => g === "overdue").length,
    blocked: blocked.length,
    firstBlocker: blocked[0]?.blocker?.description ?? null,
    doneThisWeek: work.done.thisWeek,
    doneChange: work.done.thisWeek - work.done.lastWeek,
  };
}

/** Status word for a task (the tracker's status, in plain words). */
export function taskStatusWord(status: string, blocked: boolean): string {
  if (blocked) return "Blocked";
  switch (status) {
    case "NotStarted":
      return "To do";
    case "InProgress":
      return "In progress";
    case "InReview":
      return "In review";
    case "InQA":
      return "In QA";
    case "Blocked":
      return "Blocked";
    case "Completed":
      return "Done";
    default:
      return status.replace(/([a-z])([A-Z])/g, "$1 $2");
  }
}

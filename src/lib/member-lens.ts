import { dayKey } from "@/lib/dates";
import { DUE_GROUP_LABEL, dueGroupOf, groupByDue, myTabs, tasksForTab, MY_TABS, type MyTask, type MyWork } from "@/lib/my-work";
import { projectRoleCategory } from "@/lib/roles";

/**
 * UX fidelity Tier 3 — the Member "lenses" on My Work (artifact: Member › My work, lenses
 * Developer / QA / Implementor). The KPI cards and the side panel are the same for every
 * Member; only the "Focus" list changes shape with the person's project role. Pure and
 * client-safe; the server read lives in src/server/my-work.ts.
 */

export const MEMBER_LENSES = ["developer", "qa", "implementor"] as const;
export type MemberLens = (typeof MEMBER_LENSES)[number];

/**
 * Which lens a Member gets. Their project roles (src/lib/roles.ts › projectRoleCategory)
 * are weighed by where their open work sits: each active project counts once, plus once per
 * open task assigned to them there (and per open bug they raised there). The heaviest of
 * Dev / QA / Implementor wins; a tie goes to the specialist lens (QA, then Implementor),
 * because a specialist lens still lists every assigned task under "All" while the default
 * lens has no Retest or Go-Lives view. PM and stakeholder roles don't pick a lens; with no
 * QA or Implementor role at all the default (developer) lens stays exactly as it was.
 */
export function chooseMemberLens(memberships: { projectId: string; role: string }[], workByProject: ReadonlyMap<string, number> = new Map()): MemberLens {
  const weight = { Dev: 0, QA: 0, Implementor: 0 };
  for (const m of memberships) {
    const c = projectRoleCategory(m.role);
    if (c === "Dev" || c === "QA" || c === "Implementor") weight[c] += 1 + (workByProject.get(m.projectId) ?? 0);
  }
  if (weight.QA === 0 && weight.Implementor === 0) return "developer";
  if (weight.QA >= weight.Implementor && weight.QA >= weight.Dev) return "qa";
  if (weight.Implementor >= weight.Dev) return "implementor";
  return "developer";
}

/**
 * QA "Ready to retest": a bug in QUBIT's InQA status that is assigned to the person or that
 * they raised. Mirrored YouTrack states "In QA", "Testing", "Ready for test" and "Ready to
 * test" all land on InQA (src/server/connectors/youtrack.ts), i.e. the developer has handed
 * the fix back for verification. YouTrack's "Fixed"/"Verified" map to Completed, so a bug
 * that skips "Ready for test" never shows here — QUBIT can't tell it apart from a closed one.
 * Non-bug work in InQA is first-time testing, not a retest, and keeps its "In QA" chip.
 */
export function isReadyToRetest(t: Pick<MyTask, "type" | "status">): boolean {
  return t.type === "Bug" && t.status === "InQA";
}

// ── Implementor lens data (read by the server for Implementor-lens Members only) ──

/** A go-live milestone on a project the person implements. */
export interface LensGoLive {
  id: string;
  projectId: string;
  projectName: string;
  milestoneName: string;
  /** The market the milestone is tagged to, when it is. */
  marketId: string | null;
  marketName: string | null;
  dueDate: Date | null;
  /** Open / total gates on that market's track (or the project's track), null without a gate template. */
  gates: { open: number; total: number } | null;
}

/** An open issue (Register) on a project the person implements. */
export interface LensIssue {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  severity: string;
  status: string;
  raisedAt: Date;
  /** The person owns it (so they may update it). */
  mine: boolean;
}

/** A handover document that isn't approved yet, on a project the person implements. */
export interface LensHandover {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  status: string;
  version: number;
  updatedAt: Date;
  /** The person wrote it (so sending it for approval is theirs). */
  mine: boolean;
}

export interface ImplementorLensData {
  goLives: LensGoLive[];
  issues: LensIssue[];
  handovers: LensHandover[];
}

/** Milestone names that mean a go-live ("Go-live — pilot branch", "Riverbank Go Live", "Launch"). */
export const GO_LIVE_NAME = /\bgo[\s-]?live\b|\blaunch\b/i;
/** Issue statuses still open in the Register (src/server/issues.ts). */
export const OPEN_ISSUE_STATUSES = ["Open", "Investigating"] as const;

/** Dated go-lives first, soonest (overdue included) first; undated ones last, by name. */
export function sortGoLives<T extends Pick<LensGoLive, "dueDate" | "projectName" | "milestoneName">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.projectName.localeCompare(b.projectName) || a.milestoneName.localeCompare(b.milestoneName);
  });
}

/** Tenant-local whole days from `now` to `due` (negative = late). */
export function daysUntil(due: Date, now: Date, tz: string): number {
  const a = Date.parse(`${dayKey(now, tz)}T12:00:00Z`);
  const b = Date.parse(`${dayKey(due, tz)}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export type LensTone = "ok" | "warn" | "bad" | "info" | "muted";

/** The go-live row's chip: how far away it is, in sentence case. */
export function goLiveChip(due: Date | null, now: Date, tz: string): { tone: LensTone; label: string } {
  if (!due) return { tone: "muted", label: "No date" };
  const d = daysUntil(due, now, tz);
  if (d < 0) return { tone: "bad", label: `${-d} ${d === -1 ? "day" : "days"} late` };
  if (d === 0) return { tone: "warn", label: "Today" };
  if (d === 1) return { tone: "warn", label: "Tomorrow" };
  return { tone: d <= 7 ? "warn" : "muted", label: `${d} days` };
}

export function issueChip(status: string): { tone: LensTone; label: string } {
  return status === "Investigating" ? { tone: "warn", label: "Investigating" } : { tone: "bad", label: "Open" };
}

export function handoverChip(status: string): { tone: LensTone; label: string } {
  if (status === "InReview") return { tone: "info", label: "Waiting" };
  if (status === "Rejected") return { tone: "warn", label: "Returned" };
  return { tone: "muted", label: "Draft" };
}

// ── The Focus list for each lens: tabs with counts, and grouped rows ──

export type LensRow =
  | { kind: "task"; task: MyTask; retest: boolean }
  | { kind: "golive"; goLive: LensGoLive }
  | { kind: "issue"; issue: LensIssue }
  | { kind: "handover"; doc: LensHandover };

export interface LensGroup {
  key: string;
  label: string;
  /** Due groups mark late rows (the meta turns red). */
  overdue: boolean;
  rows: LensRow[];
}

export interface LensTab {
  key: string;
  label: string;
  count: number;
}

export interface LensView {
  tabs: LensTab[];
  tab: string;
  groups: LensGroup[];
}

export type LensWork = Pick<MyWork, "tasks" | "raised" | "projects"> & { lens: MemberLens; implementor: ImplementorLensData | null };

export const QA_TABS = ["all", "retest", "today", "raised"] as const;
export const IMPLEMENTOR_TABS = ["all", "golives", "issues", "handover"] as const;

const taskRow = (task: MyTask, retest = false): LensRow => ({ kind: "task", task, retest });

function dueGroups(tasks: MyTask[], now: Date, tz: string, retest: (t: MyTask) => boolean = () => false): LensGroup[] {
  return groupByDue(tasks, now, tz).map((g) => ({ key: g.group, label: DUE_GROUP_LABEL[g.group], overdue: g.group === "overdue", rows: g.tasks.map((t) => taskRow(t, retest(t))) }));
}

const count = (groups: LensGroup[]) => groups.reduce((n, g) => n + g.rows.length, 0);

/** Tabs, the chosen tab (unknown → "all") and the grouped rows for the person's lens. */
export function lensView(work: LensWork, rawTab: string | null | undefined, now: Date, tz: string): LensView {
  if (work.lens === "qa") return qaView(work, rawTab, now, tz);
  if (work.lens === "implementor") return implementorView(work, rawTab, now, tz);
  // Default (developer) lens: unchanged from UX6.
  const tabs = myTabs(work, now, tz);
  const tab = MY_TABS.includes(rawTab as (typeof MY_TABS)[number]) && tabs.some((t) => t.key === rawTab) ? (rawTab as (typeof MY_TABS)[number]) : "all";
  return { tabs, tab, groups: dueGroups(tasksForTab(work, tab, now, tz), now, tz) };
}

function qaView(work: LensWork, rawTab: string | null | undefined, now: Date, tz: string): LensView {
  // Bugs you raised that came back for retest join your list; the rest stay under "Issues I Raised".
  const readyRaised = work.raised.filter(isReadyToRetest);
  const mine = [...work.tasks, ...readyRaised];
  const retestTasks = mine.filter(isReadyToRetest);
  const today = mine.filter((t) => dueGroupOf(t.dueDate, now, tz) === "today");
  const lists: Record<(typeof QA_TABS)[number], MyTask[]> = { all: mine, retest: retestTasks, today, raised: work.raised };
  const tabs: LensTab[] = [
    { key: "all", label: "All", count: mine.length },
    { key: "retest", label: "Retest", count: retestTasks.length },
    { key: "today", label: "Today", count: today.length },
    { key: "raised", label: "Issues I Raised", count: work.raised.length },
  ];
  const tab = (QA_TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as (typeof QA_TABS)[number]) : "all";
  return { tabs, tab, groups: dueGroups(lists[tab], now, tz, isReadyToRetest) };
}

function implementorView(work: LensWork, rawTab: string | null | undefined, now: Date, tz: string): LensView {
  const data = work.implementor ?? { goLives: [], issues: [], handovers: [] };
  const goLives = sortGoLives(data.goLives);
  const issueGroup = (): LensGroup => ({ key: "issues", label: "Rollout Issues", overdue: false, rows: data.issues.map((issue) => ({ kind: "issue", issue })) });
  const handoverGroup = (): LensGroup => ({ key: "handover", label: "Handover", overdue: false, rows: data.handovers.map((doc) => ({ kind: "handover", doc })) });
  const goLiveRows = (list: LensGoLive[]): LensRow[] => list.map((goLive) => ({ kind: "golive", goLive }));

  const all: LensGroup[] = [
    // "Next go-live" is the single soonest one; the rest are a tab away.
    { key: "next", label: "Next Go-Live", overdue: false, rows: goLiveRows(goLives.slice(0, 1)) },
    ...dueGroups(work.tasks, now, tz),
    issueGroup(),
    handoverGroup(),
  ].filter((g) => g.rows.length > 0);

  const byTab: Record<(typeof IMPLEMENTOR_TABS)[number], LensGroup[]> = {
    all,
    golives: [
      { key: "next", label: "Next Go-Live", overdue: false, rows: goLiveRows(goLives.slice(0, 1)) },
      { key: "later", label: "Later Go-Lives", overdue: false, rows: goLiveRows(goLives.slice(1)) },
    ].filter((g) => g.rows.length > 0),
    issues: [issueGroup()].filter((g) => g.rows.length > 0),
    handover: [handoverGroup()].filter((g) => g.rows.length > 0),
  };
  const tabs: LensTab[] = [
    { key: "all", label: "All", count: count(all) },
    { key: "golives", label: "Go-Lives", count: goLives.length },
    { key: "issues", label: "Rollout Issues", count: data.issues.length },
    { key: "handover", label: "Handover", count: data.handovers.length },
  ];
  const tab = (IMPLEMENTOR_TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as (typeof IMPLEMENTOR_TABS)[number]) : "all";
  return { tabs, tab, groups: byTab[tab] };
}

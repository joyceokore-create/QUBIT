import { dayKey } from "@/lib/dates";
import { matchesSearch } from "@/lib/list-state";

/**
 * UX8 — Approvals v1 (UX plan D5), the pure part. One queue of what the viewer may decide
 * today: ideas waiting for triage and open staffing requests. The weekly roll-up is approved
 * in Reports, so it is a summary banner here, never a row. Gate approvals and Decisions wait
 * for a workflow spec (UX13). Client-safe; ages are tenant-local calendar days (U5).
 */

export const APPROVAL_TABS = ["all", "ideas", "staffing"] as const;
export type ApprovalTab = (typeof APPROVAL_TABS)[number];
export const APPROVAL_TAB_LABEL: Record<ApprovalTab, string> = { all: "All", ideas: "Ideas", staffing: "Staffing" };

/** The open idea statuses — the only ones triage can still act on. */
export const OPEN_IDEA_STATUSES = ["New", "Reviewing"] as const;
export type OpenIdeaStatus = (typeof OPEN_IDEA_STATUSES)[number];

export interface ApprovalIdea {
  kind: "idea";
  id: string;
  title: string;
  /** ISO timestamp the idea was submitted. */
  createdAt: string;
  personName: string | null;
  status: OpenIdeaStatus;
  sponsor: string;
  problem: string;
  expectedValue: string | null;
  suggestedPortfolioName: string | null;
}

export interface ApprovalStaffing {
  kind: "staffing";
  id: string;
  /** ISO timestamp the request was raised. */
  createdAt: string;
  personName: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  role: string;
  allocationPct: number;
  windowStart: string;
  windowEnd: string;
  note: string | null;
}

export type ApprovalItem = ApprovalIdea | ApprovalStaffing;

export interface RollupSummary {
  isoWeek: string;
  /** Confirmed check-ins sent to the Head this week — Reports › This week's "in". */
  received: number;
  /** Active projects (not Completed / Cancelled). */
  total: number;
  approved: boolean;
}

export interface ApprovalsFeed {
  can: { ideas: boolean; staffing: boolean };
  items: ApprovalItem[];
  /** Null unless the viewer may approve the roll-up. */
  rollup: RollupSummary | null;
}

// ── Age ────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

/** Whole tenant-local calendar days since `at` (0 = today). A future time reads as today. */
export function ageDays(at: Date | string, now: Date, tz: string): number {
  const d = Math.round((Date.parse(`${dayKey(now, tz)}T00:00:00Z`) - Date.parse(`${dayKey(at, tz)}T00:00:00Z`)) / DAY);
  return Math.max(0, d);
}

/** "Today", "1 day", "6 days". */
export function ageLabel(days: number): string {
  if (days <= 0) return "Today";
  return days === 1 ? "1 day" : `${days} days`;
}

/** The Age filter. "Last 7 days" includes today (rolling, like Ideas › Submitted); "Older" is everything before. */
export const AGE_BUCKETS = ["today", "week", "older"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];
export const AGE_LABEL: Record<AgeBucket, string> = { today: "Today", week: "Last 7 days", older: "Older" };

export function matchesAge(filter: string, days: number): boolean {
  switch (filter) {
    case "today":
      return days === 0;
    case "week":
      return days <= 7;
    case "older":
      return days > 7;
    default:
      return true;
  }
}

// ── List ───────────────────────────────────────────────────────────────────────

/** Most urgent first = waited longest first; ties keep a stable, readable order. */
export function sortApprovals<T extends ApprovalItem>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.kind.localeCompare(b.kind) || approvalTitle(a).localeCompare(approvalTitle(b)) || a.id.localeCompare(b.id),
  );
}

export function itemsForTab<T extends ApprovalItem>(items: readonly T[], tab: ApprovalTab): T[] {
  if (tab === "ideas") return items.filter((i) => i.kind === "idea");
  if (tab === "staffing") return items.filter((i) => i.kind === "staffing");
  return [...items];
}

export function approvalTabs(items: readonly ApprovalItem[]): { key: ApprovalTab; label: string; count: number }[] {
  return APPROVAL_TABS.map((key) => ({ key, label: APPROVAL_TAB_LABEL[key], count: itemsForTab(items, key).length }));
}

export function parseTab(raw: string): ApprovalTab {
  return (APPROVAL_TABS as readonly string[]).includes(raw) ? (raw as ApprovalTab) : "all";
}

/** The row's headline: the idea's title, or "1 QA Engineer for Card Issuing Platform". */
export function approvalTitle(item: ApprovalItem): string {
  return item.kind === "idea" ? item.title : `1 ${item.role} for ${item.projectName}`;
}

/** Search covers the project and the people ("Search approvals by project or person"). */
export function matchesApprovalSearch(q: string, item: ApprovalItem): boolean {
  return item.kind === "idea"
    ? matchesSearch(q, item.title, item.sponsor, item.personName)
    : matchesSearch(q, item.projectName, item.projectCode, item.personName, item.role);
}

/** The Project filter's choices: the projects named by the rows (ideas have none yet). */
export function projectOptions(items: readonly ApprovalItem[]): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const i of items) if (i.kind === "staffing") seen.set(i.projectId, i.projectName);
  return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** All of search + Project + Age. A Project filter hides ideas: an idea has no project until it is accepted. */
export function filterApprovals<T extends ApprovalItem>(
  items: readonly T[],
  f: { q: string; project: string; age: string },
  now: Date,
  tz: string,
): T[] {
  return items.filter(
    (i) =>
      matchesApprovalSearch(f.q, i) &&
      (!f.project || (i.kind === "staffing" && i.projectId === f.project)) &&
      matchesAge(f.age, ageDays(i.createdAt, now, tz)),
  );
}

/** Window event the Approvals page fires after a decision, so the sidebar badge recounts. */
export const APPROVALS_CHANGED = "qubit:approvals-changed";

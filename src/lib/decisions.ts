import { z } from "zod";
import { dayKey, formatDayMonth } from "@/lib/dates";
import type { ChipTone } from "@/components/ui/status-pill";

/**
 * WS2 (UX fidelity Tier 4, mwashukes-desk/plans/ws1-ws2-proposals.md) — Decisions waiting on the
 * Group and GLC actions, the pure part. Client-safe; the server engine is
 * src/server/decision-requests.ts. Days are tenant-local calendar days (U5).
 *
 * The rules (the proposal's defaults, "yes to all"):
 *  - a Head (Head or Head of QA) may raise a decision for any project, or none;
 *  - a PM may raise one for a project they run (canWriteProject, checked on the server);
 *  - only Executives decide: approve, decline (note required) or defer (new due date + note);
 *  - GLC actions are the Group-level committee's action items: Executives and Heads create
 *    them; the owner, an Executive or a Head marks one done.
 */

export const DECISION_TABS = ["waiting", "decided", "actions"] as const;
export type DecisionTab = (typeof DECISION_TABS)[number];
export const DECISION_TAB_LABEL: Record<DecisionTab, string> = { waiting: "Waiting", decided: "Decided", actions: "GLC Actions" };

export function parseDecisionTab(raw: string | null | undefined): DecisionTab {
  return (DECISION_TABS as readonly string[]).includes(raw ?? "") ? (raw as DecisionTab) : "waiting";
}

/** Status values. `deferred` still waits on the Group (it lists under Waiting). */
export const REQUEST_STATUSES = ["waiting", "decided", "deferred"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const WAITING_STATUSES: RequestStatus[] = ["waiting", "deferred"];
export const OUTCOMES = ["approved", "declined"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const GLC_STATUSES = ["open", "done"] as const;
export type GlcStatus = (typeof GLC_STATUSES)[number];

const HEAD_ROLES = ["HeadOfProjects", "HeadOfQA"];

export const isHead = (roles: readonly string[]) => roles.some((r) => HEAD_ROLES.includes(r));
export const isExecutive = (roles: readonly string[]) => roles.includes("Executive");
/** Only Executives record the Group's decision. */
export const canDecide = (roles: readonly string[]) => isExecutive(roles);
/** Who may create a GLC action: Executives and Heads. */
export const canCreateGlcAction = (roles: readonly string[]) => isExecutive(roles) || isHead(roles);
/** Who may mark a GLC action done: its owner, an Executive or a Head. */
export const canCompleteGlcAction = (roles: readonly string[], userId: string, ownerId: string | null) =>
  ownerId === userId || isExecutive(roles) || isHead(roles);

// ── Inputs (shared by the routes and the engine) ───────────────────────────────

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-20.");
const ID = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid id.");
const TEXT = (max: number) => z.string().trim().max(max);

export const RaiseInput = z.object({
  title: TEXT(160).min(3, "Give the decision a title (3 characters or more)."),
  projectId: ID.nullable().optional(),
  context: TEXT(2000).optional(),
  ifApproved: TEXT(300).optional(),
  ifDeclined: TEXT(300).optional(),
  dueDate: DAY.nullable().optional(),
});
export type RaiseInputT = z.infer<typeof RaiseInput>;

const NOTE = (why: string) => z.string({ required_error: why }).trim().max(2000).min(3, why);
export const DecideInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), note: TEXT(2000).optional() }),
  z.object({ action: z.literal("decline"), note: NOTE("Say why it was declined — the note goes on the record.") }),
  z.object({ action: z.literal("defer"), note: NOTE("Say why it was deferred — the note goes on the record."), dueDate: z.string({ required_error: "Choose the new due date." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-20.") }),
]);
export type DecideInputT = z.infer<typeof DecideInput>;

export const GlcCreateInput = z.object({
  title: TEXT(200).min(3, "Give the action a title (3 characters or more)."),
  projectId: ID.nullable().optional(),
  decisionRequestId: ID.nullable().optional(),
  ownerId: ID.nullable().optional(),
  dueDate: DAY.nullable().optional(),
});
export type GlcCreateInputT = z.infer<typeof GlcCreateInput>;

/** The options a request carries: what happens if approved / if declined. */
export const RequestOptions = z.array(z.object({ label: z.string().max(40), text: z.string().max(300) })).max(4);
export type RequestOption = z.infer<typeof RequestOptions>[number];

export function readOptions(raw: unknown): RequestOption[] {
  const parsed = RequestOptions.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function buildOptions(input: Pick<RaiseInputT, "ifApproved" | "ifDeclined">): RequestOption[] {
  const out: RequestOption[] = [];
  if (input.ifApproved) out.push({ label: "If approved", text: input.ifApproved });
  if (input.ifDeclined) out.push({ label: "If declined", text: input.ifDeclined });
  return out;
}

// ── Due dates ────────────────────────────────────────────────────────────────

export const DUE_FILTERS = ["overdue", "this-week", "next-week", "later", "none"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];
export const DUE_FILTER_LABEL: Record<DueFilter, string> = {
  overdue: "Overdue",
  "this-week": "This week",
  "next-week": "Next week",
  later: "Later",
  none: "No due date",
};

const keyToUtc = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const utcToKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const DAY_MS = 86_400_000;

/** Add `n` calendar days to a day key. */
export function addDays(key: string, n: number): string {
  return utcToKey(keyToUtc(key) + n * DAY_MS);
}

/** Monday of the (Mon–Sun) week a day key falls in. */
export function weekStart(key: string): string {
  const dow = new Date(keyToUtc(key)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

export type DueBucket = Exclude<DueFilter, "none">;

/** Where a due day sits against today: overdue (before today), this week (today → Sunday),
 * next week, or later. Due today is "this-week", never overdue. */
export function dueBucket(dueKey: string, todayKey: string): DueBucket {
  if (dueKey < todayKey) return "overdue";
  const mon = weekStart(todayKey);
  if (dueKey <= addDays(mon, 6)) return "this-week";
  if (dueKey <= addDays(mon, 13)) return "next-week";
  return "later";
}

/** The day-key bounds of a due filter, both inclusive (undefined = open-ended). */
export function dueFilterDays(f: DueBucket, todayKey: string): { from?: string; to?: string } {
  const mon = weekStart(todayKey);
  switch (f) {
    case "overdue":
      return { to: addDays(todayKey, -1) };
    case "this-week":
      return { from: todayKey, to: addDays(mon, 6) };
    case "next-week":
      return { from: addDays(mon, 7), to: addDays(mon, 13) };
    case "later":
      return { from: addDays(mon, 14) };
  }
}

export interface ChipView {
  tone: ChipTone;
  label: string;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The row chip for something still open: Overdue · Due today · Due Fri · Next week · Later. */
export function dueChip(due: string | Date | null, now: Date, tz: string): ChipView {
  if (!due) return { tone: "muted", label: "No due date" };
  const dk = dayKey(due, tz);
  const today = dayKey(now, tz);
  const b = dueBucket(dk, today);
  if (b === "overdue") return { tone: "bad", label: "Overdue" };
  if (b === "this-week") return { tone: "warn", label: dk === today ? "Due today" : `Due ${WEEKDAY[new Date(keyToUtc(dk)).getUTCDay()]}` };
  if (b === "next-week") return { tone: "muted", label: "Next week" };
  return { tone: "muted", label: "Later" };
}

/** The row's date column: "was 6 Nov" once overdue, else "13 Nov"; "No date". */
export function dueMeta(due: string | Date | null, now: Date, tz: string): string {
  if (!due) return "No date";
  return `${dayKey(due, tz) < dayKey(now, tz) ? "was " : ""}${formatDayMonth(due, tz)}`;
}

export function outcomeChip(outcome: string | null): ChipView {
  return outcome === "approved" ? { tone: "ok", label: "Approved" } : outcome === "declined" ? { tone: "bad", label: "Declined" } : { tone: "muted", label: "Decided" };
}

export function glcChip(status: string, due: string | Date | null, now: Date, tz: string): ChipView {
  if (status === "done") return { tone: "ok", label: "Done" };
  const c = dueChip(due, now, tz);
  return c.label === "No due date" ? { tone: "muted", label: "Open" } : c;
}

/** "raised by Head" (the design names the Head by role only), "raised by PM user_04", or
 * "raised by user_01" for anyone else (e.g. a Super Admin). */
export function raisedByLine(raiser: { name: string; roles: readonly string[] }): string {
  if (raiser.roles.includes("HeadOfProjects")) return "raised by Head";
  if (raiser.roles.includes("HeadOfQA")) return "raised by Head of QA";
  if (raiser.roles.includes("ProjectManager")) return `raised by PM ${raiser.name}`;
  return `raised by ${raiser.name}`;
}

/** The drawer subtitle's version: "raised by Head (user_003)". */
export function raisedByFull(raiser: { name: string; roles: readonly string[] }): string {
  if (raiser.roles.includes("HeadOfProjects")) return `raised by Head (${raiser.name})`;
  if (raiser.roles.includes("HeadOfQA")) return `raised by Head of QA (${raiser.name})`;
  return raisedByLine(raiser);
}

/** The Register entry's title for a decided request. */
export function registerTitle(outcome: Outcome, title: string): string {
  return `${outcome === "approved" ? "Approved" : "Declined"}: ${title}`.slice(0, 300);
}

// ── Rows the page renders ──────────────────────────────────────────────────────

export interface DecisionRow {
  id: string;
  title: string;
  context: string | null;
  options: RequestOption[];
  projectId: string | null;
  projectName: string | null;
  raisedBy: { id: string; name: string; roles: string[] };
  dueDate: string | null;
  status: RequestStatus;
  outcome: Outcome | null;
  outcomeNote: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionId: string | null;
  createdAt: string;
  /** Names of the people a decision notifies (the raiser and the project's PM). */
  notifyNames: string[];
}

export interface GlcRow {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  status: GlcStatus;
  decisionRequestId: string | null;
  decisionTitle: string | null;
  createdAt: string;
}

/** Fires on the window after a change on /decisions, so the sidebar count re-reads. */
export const DECISIONS_CHANGED = "qubit:decisions-changed";

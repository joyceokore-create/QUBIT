import { dayKey, formatDayMonth, formatTime } from "@/lib/dates";
import { VIEW_ROLE_LABEL } from "@/lib/view-roles";
import type { PageInfo } from "@/lib/list-state";

/**
 * UX11 — Super Admin › Admin home, the pure part (UX plan D3/D4, UX11): the access-request
 * tabs, ages and chips, the tenant-local week start for "Role changes this week", the
 * integration health line and the plain-words admin activity feed. Built from
 * `AdminHomeData` (src/server/admin-home.ts). Client-safe.
 */

const DAY_MS = 86_400_000;

// ── Access requests ────────────────────────────────────────────────────────────────

export const AR_TABS = ["waiting", "reviewed", "dismissed"] as const;
export type ArTab = (typeof AR_TABS)[number];
// Design spec v2: Waiting · Approved · Declined. URL keys stay "reviewed"/"dismissed" (a
// reviewed request is one whose account was created; a dismissed one was declined).
export const AR_TAB_LABEL: Record<ArTab, string> = { waiting: "Waiting", reviewed: "Approved", dismissed: "Declined" };
export type ArStatus = "NEW" | "REVIEWED" | "DISMISSED";
export const AR_TAB_STATUS: Record<ArTab, ArStatus> = { waiting: "NEW", reviewed: "REVIEWED", dismissed: "DISMISSED" };
/** Waiting: oldest first. Reviewed / Dismissed: most recently reviewed first. */
export const AR_TAB_SORT: Record<ArTab, "oldest" | "reviewed"> = { waiting: "oldest", reviewed: "reviewed", dismissed: "reviewed" };

/** An unknown or missing tab falls back to Waiting. */
export function parseArTab(raw: string | null | undefined): ArTab {
  return (AR_TABS as readonly string[]).includes(raw ?? "") ? (raw as ArTab) : "waiting";
}

export interface AdminRequestRow {
  id: string;
  fullName: string;
  email: string;
  company: string;
  jobTitle: string | null;
  status: ArStatus;
  createdAt: string;
  reviewedAt: string | null;
  /** Reviewer's name when they are in the viewer's tenant (RLS), else null. */
  reviewedBy: string | null;
}

export type Tone = "bad" | "warn" | "info" | "ok" | "muted";

/** Whole tenant-local days between two instants (0 = same day). */
export function daysOld(from: Date | string, now: Date, tz: string): number {
  const a = Date.parse(`${dayKey(from, tz)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(now, tz)}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

/** "Today", "1 day", "5 days". */
export function ageLabel(days: number): string {
  if (days <= 0) return "Today";
  return days === 1 ? "1 day" : `${days} days`;
}

/** Row meta, as the design words it: "Today", "1 day ago", "2 days ago". */
export function agoLabel(days: number): string {
  return days <= 0 ? "Today" : `${ageLabel(days)} ago`;
}

/** Row chip (design: "New"). A request is New for its first two days, then Waiting —
 * amber from day 2, red from day 5. Decided requests read Approved / Declined. */
export function requestChip(status: ArStatus, days: number): { label: string; tone: Tone } {
  if (status === "REVIEWED") return { label: "Approved", tone: "ok" };
  if (status === "DISMISSED") return { label: "Declined", tone: "muted" };
  if (days < 2) return { label: "New", tone: "info" };
  return { label: "Waiting", tone: days >= 5 ? "bad" : "warn" };
}

/** Bucket timestamps into the last `days` tenant-local calendar days, oldest first (the
 * KPI bar and spark charts). Only real history — never a projected value. */
export function dailySeries(stamps: (string | Date)[], now: Date, tz: string, days = 7, keyOf: (d: Date | string, tz: string) => string): number[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(keyOf(new Date(now.getTime() - i * 86_400_000), tz));
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const s of stamps) {
    const k = keyOf(s, tz);
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }
  return keys.map((k) => counts.get(k)!);
}

/** KPI context for "Access requests waiting". */
export function oldestContext(oldestAt: Date | string | null, now: Date, tz: string): string {
  if (!oldestAt) return "None waiting";
  const d = daysOld(oldestAt, now, tz);
  return d === 0 ? "Oldest: today" : `Oldest: ${d} ${d === 1 ? "day" : "days"}`;
}

/** Roles whose grant the UX plan says needs a Head's approval first — not built yet. */
export const HEAD_APPROVAL_ROLES: readonly string[] = ["ProjectManager", "HeadOfProjects"];
export function needsHeadApproval(role: string): boolean {
  return HEAD_APPROVAL_ROLES.includes(role);
}

// ── Dates ────────────────────────────────────────────────────────────────────────────

function wallClock(d: Date, tz: string) {
  const out: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return Date.UTC(out.year, out.month - 1, out.day, out.hour, out.minute, out.second);
}

/** The instant a tenant-local calendar day ("2026-11-09") starts, in that zone. */
export function localMidnight(day: string, tz: string): Date {
  const guess = Date.parse(`${day}T00:00:00Z`);
  // Offset of the zone at (about) that moment; a second pass settles DST edges.
  let t = guess - (wallClock(new Date(guess), tz) - guess);
  t = guess - (wallClock(new Date(t), tz) - t);
  return new Date(t);
}

/** Monday 00:00 of the current ISO week, in the tenant's zone. */
export function weekStartInZone(now: Date, tz: string): Date {
  const today = dayKey(now, tz);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay() || 7; // Monday = 1 … Sunday = 7
  const monday = new Date(Date.parse(`${today}T00:00:00Z`) - (dow - 1) * DAY_MS).toISOString().slice(0, 10);
  return localMidnight(monday, tz);
}

/** "08:40" today, otherwise "9 Nov, 08:40". */
export function whenLabel(d: Date | string, now: Date, tz: string): string {
  return dayKey(d, tz) === dayKey(now, tz) ? formatTime(d, tz) : `${formatDayMonth(d, tz)}, ${formatTime(d, tz)}`;
}

// ── Integrations ─────────────────────────────────────────────────────────────────────

export interface IntegrationRow {
  provider: string;
  /** Tenant-level connection (YouTrack): its status, else null (project-level only). */
  tenantStatus: string | null;
  tenantError: string | null;
  /** Connected project links for this provider. */
  projects: number;
  failingProjects: number;
  /** Newest project lastSyncAt — the last sync that ran. */
  lastRunAt: string | null;
  /** False when the provider's feature flag is off (sync paused deployment-wide). */
  enabled: boolean;
}

const PROVIDER_LABEL: Record<string, string> = {
  youtrack: "YouTrack sync",
  github: "GitHub",
  github_actions: "GitHub Actions",
  teams: "Microsoft Teams",
  calendar: "Calendar",
  sentry: "Sentry",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function integrationHealth(r: IntegrationRow): { label: string; tone: Tone } {
  if (!r.enabled) return { label: "Off", tone: "muted" };
  if (r.tenantStatus === "error" || r.failingProjects > 0) return { label: "Failing", tone: "bad" };
  if (!r.lastRunAt) return { label: "Not run yet", tone: "muted" };
  return { label: "Healthy", tone: "ok" };
}

/** "last run 08:40 · 2 of 9 projects failing" — only what the rows actually say. */
export function integrationDetail(r: IntegrationRow, now: Date, tz: string): string {
  const parts: string[] = [r.lastRunAt ? `last run ${whenLabel(r.lastRunAt, now, tz)}` : "no sync yet"];
  if (r.failingProjects > 0) parts.push(`${r.failingProjects} of ${r.projects} ${r.projects === 1 ? "project" : "projects"} failing`);
  else if (r.tenantStatus === "error") parts.push("connection error");
  else if (r.projects > 0) parts.push(`${r.projects} ${r.projects === 1 ? "project" : "projects"}`);
  return parts.join(" · ");
}

// ── Recent admin activity ────────────────────────────────────────────────────────────

export interface ActivityRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
  actorName: string | null;
  /** The user (or access-request) the row is about, when it can be named. */
  targetName: string | null;
}

/** What the home shows for one row: the line, who, when. */
export interface AdminActivity {
  id: string;
  line: string;
  actorName: string | null;
  createdAt: string;
}

function field(v: unknown, key: string): unknown {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>)[key] : undefined;
}
const str = (v: unknown) => (typeof v === "string" ? v : null);

const ROLE_WORD: Record<string, string> = VIEW_ROLE_LABEL;
function roleWord(role: string | null): string {
  return role ? (ROLE_WORD[role] ?? role) : "a role";
}

/** One plain line for an admin audit row, e.g. "Granted Project Manager to user_014". */
export function activityLine(r: ActivityRow): string {
  const who = r.targetName ?? "a user";
  switch (r.action) {
    case "role_grant":
      return `Granted ${roleWord(str(field(r.after, "role")))} to ${who}`;
    case "role_revoke":
      return `Removed ${roleWord(str(field(r.before, "role")))} from ${who}`;
    case "access_request_review": {
      const s = str(field(r.after, "status"));
      const from = r.targetName ? ` from ${r.targetName}` : "";
      if (s === "DISMISSED") return `Dismissed the access request${from}`;
      return field(r.after, "userId") ? `Granted the access request${from}` : `Reviewed the access request${from}`;
    }
    case "view_switch": {
      const role = str(field(r.after, "viewRole"));
      return `Switched “Viewing as” to ${role ? roleWord(role) : "another role"}`;
    }
    case "create":
      return `Created the account for ${who}`;
    case "delete":
      return `Removed the account for ${who}`;
    case "update": {
      if (field(r.after, "mfa_reset") === true) return `Reset MFA for ${who}`;
      const s = str(field(r.after, "status"));
      if (s === "SUSPENDED") return `Suspended ${who}`;
      if (s === "ACTIVE") return `Reactivated ${who}`;
      return `Updated ${who}`;
    }
    default:
      return `${r.action.replace(/_/g, " ")} · ${who}`;
  }
}

/**
 * Newest first, and a role grant written in the same breath as an account's creation (the
 * same actor, the same user, within a minute) folds into "Created the account" — creating one
 * person shouldn't fill the feed twice.
 */
export function collapseActivity(rows: ActivityRow[], limit = 5): ActivityRow[] {
  const sorted = [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
  const creates = sorted.filter((r) => r.action === "create" && r.entityType === "user");
  const out = sorted.filter(
    (r) =>
      !(
        r.action === "role_grant" &&
        creates.some((c) => c.entityId === r.entityId && c.actorId === r.actorId && Math.abs(Date.parse(c.createdAt) - Date.parse(r.createdAt)) < 60_000)
      ),
  );
  return out.slice(0, limit);
}

// ── The home's payload (src/server/admin-home.ts) ─────────────────────────────────

export interface AdminHomeData {
  timeZone: string;
  sso: boolean;
  kpis: {
    /** null when the viewer can't review access requests (no iam:manage). */
    waiting: { count: number; oldestAt: string | null; perDay: number[] } | null;
    activeUsers: { active30: number; active: number; since: string };
    /** null under SSO — MFA lives at the identity provider, which the app can't see. */
    noMfa: number | null;
    roleChanges: { granted: number; removed: number; since: string; perDay: number[] };
  };
  requests: {
    tab: ArTab;
    counts: Record<ArStatus, number>;
    rows: AdminRequestRow[];
    info: PageInfo;
  } | null;
  attention: { noMfa: number | null; expiredInvites: number; suspendedInTeams: number };
  integrations: IntegrationRow[] | null;
  /** Plain lines only — the raw before/after JSON never leaves the server. */
  activity: AdminActivity[] | null;
  /** Options for the Grant access form. null when the viewer can't create users. */
  grant: { departments: { id: string; name: string }[]; teams: { id: string; name: string }[]; canGrantSuperAdmin: boolean } | null;
}

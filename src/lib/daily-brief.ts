import type { CockpitProject } from "@/server/dashboard-cockpit";
import { GATE_KEYS, GATE_LABELS } from "@/lib/cockpit-gates";
import { dayKey, formatDayMonth, isOverdue } from "@/lib/dates";
import { SUPER_ADMIN, type ViewRole } from "@/lib/view-roles";

/**
 * UX4 — the Daily Brief (UX plan D4, D4a). One deterministic builder per role, worked out from
 * the same data as the figures on the page (never AI-generated), so the Brief can't disagree
 * with the numbers beneath it. Pure and client-safe: the server reads the inputs under RLS
 * (src/server/daily-brief.ts) and the card only renders what comes back.
 *
 * Ranking (D4a): Needs action now (overdue / red) → Waiting on you (disputes, queues) → For your
 * information; inside a group the heavier item first. The card shows the top three; the drawer
 * shows everything, grouped.
 */

export const BRIEF_GROUPS = ["now", "wait", "fyi"] as const;
export type BriefGroup = (typeof BRIEF_GROUPS)[number];
export const BRIEF_GROUP_LABEL: Record<BriefGroup, string> = {
  now: "Needs action now",
  wait: "Waiting on you",
  fyi: "For your information",
};

export interface BriefItem {
  /** Stable within one Brief: the drawer scrolls to it when a line is clicked. */
  id: string;
  group: BriefGroup;
  /** Sort weight inside the group: larger first (days overdue, counts…). */
  weight: number;
  emphasis: string;
  detail: string;
  action: { label: string; href: string };
}

export interface Brief {
  items: BriefItem[];
  generatedAt: Date;
}

export const BRIEF_CARD_LINES = 3;
export const BRIEF_EMPTY = "Nothing needs your attention right now.";

// ── Inputs ───────────────────────────────────────────────────────────────────────

export interface BriefTask {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  dueDate: Date | null;
  /** The earliest open blocker on this task, if any. */
  blockedSince: Date | null;
  blockerText: string | null;
}

/** Role-specific reads beyond the cockpit payload. Absent = not fetched (no permission). */
export interface BriefExtras {
  accessRequests?: { count: number; oldestAt: Date | null };
  usersWithoutMfa?: number;
  expiredInvites?: number;
  ideasNew?: { count: number; oldestAt: Date | null };
  staffingOpen?: { count: number; oldestAt: Date | null };
  overbooked?: { name: string; pct: number }[];
  /** Project ids whose check-in for this ISO week has been sent to the Head. */
  checkInsSent?: string[];
  /** Open critical issues + open critical bugs per project (Head of QA). */
  criticalByProject?: Record<string, number>;
  myTasks?: BriefTask[];
}

export interface BriefInput {
  role: ViewRole;
  viewerId: string;
  now: Date;
  timeZone: string;
  projects: CockpitProject[];
  extras: BriefExtras;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

const RAG_WORD: Record<string, string> = { G: "Green", A: "Amber", R: "Red", N: "not rated" };
const DAY_MS = 86_400_000;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const count = (n: number, one: string, many: string) => `${n} ${plural(n, one, many)}`;

/** "A, B and C" — at most `max` names, then "and N more". */
export function nameList(names: string[], max = 3): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length > max) return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Whole tenant-local days between two instants (0 = same day). */
export function daysBetween(from: Date, to: Date, tz: string): number {
  const a = Date.parse(`${dayKey(from, tz)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(to, tz)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

function ageWords(days: number): string {
  if (days <= 0) return "from today";
  return `${days} ${plural(days, "day", "days")} old`;
}

/** ISO weekday in the tenant's zone: 1 Mon … 7 Sun. */
function weekdayIn(now: Date, tz: string): number {
  const d = new Date(`${dayKey(now, tz)}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

const projectHref = (id: string, tab?: string) => `/projects/${id}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`;
const active = (projects: CockpitProject[]) => projects.filter((p) => !["Completed", "Cancelled"].includes(p.status));

/** The milestone is overdue on the tenant's calendar (due today is not overdue). */
function milestoneOverdue(p: CockpitProject, now: Date, tz: string): boolean {
  const due = p.nextMilestone?.dueDate;
  return !!due && isOverdue(due, now, tz);
}

// ── Per-role rules ───────────────────────────────────────────────────────────────

function superAdminItems({ extras, now, timeZone: tz }: BriefInput): BriefItem[] {
  const items: BriefItem[] = [];
  const ar = extras.accessRequests;
  if (ar && ar.count > 0) {
    const age = ar.oldestAt ? daysBetween(ar.oldestAt, now, tz) : 0;
    items.push({
      id: "sa-access",
      group: age >= 2 ? "now" : "wait",
      weight: ar.count,
      emphasis: `${count(ar.count, "access request is", "access requests are")} waiting.`,
      detail: ar.count === 1 ? `It is ${ageWords(age)}.` : `The oldest is ${ageWords(age)}.`,
      action: { label: "Review", href: "/admin/access-requests" },
    });
  }
  if (extras.usersWithoutMfa) {
    const n = extras.usersWithoutMfa;
    items.push({
      id: "sa-mfa",
      group: "wait",
      weight: n,
      emphasis: `${count(n, "active user still has", "active users still have")} no MFA.`,
      detail: "They are asked to set it up at their next sign-in.",
      action: { label: "Open Users", href: "/admin/users" },
    });
  }
  if (extras.expiredInvites) {
    const n = extras.expiredInvites;
    items.push({
      id: "sa-invites",
      group: "fyi",
      weight: n,
      emphasis: `${count(n, "invite has", "invites have")} expired.`,
      detail: "Resend them or remove the accounts.",
      action: { label: "Open Users", href: "/admin/users" },
    });
  }
  return items;
}

function headItems({ projects, extras, now, timeZone: tz }: BriefInput): BriefItem[] {
  const live = active(projects);
  const items: BriefItem[] = [];

  for (const p of live) {
    const blocked = GATE_KEYS.filter((k) => p.gates[k] === "block");
    if (blocked.length) {
      items.push({
        id: `head-gate-${p.id}`,
        group: "now",
        weight: 50,
        emphasis: `${p.name}'s ${GATE_LABELS[blocked[0]]} gate is blocked.`,
        detail: "Find out what is holding it before the next gate review.",
        action: { label: "Open project", href: projectHref(p.id, "Delivery") },
      });
    }
  }

  const red = live.filter((p) => p.calculated === "R");
  if (red.length) {
    items.push({
      id: "head-red",
      group: "now",
      weight: 40 + red.length,
      emphasis: `${count(red.length, "project calculates", "projects calculate")} Red.`,
      detail: `${nameList(red.map((p) => p.name))}. Decide what to escalate this week.`,
      action: red.length === 1 ? { label: "Open project", href: projectHref(red[0].id) } : { label: "See projects", href: "/projects" },
    });
  }

  // The same rule as the Head's "To escalate upward" figure (head.tsx), so they always agree.
  const escalate = live.filter((p) => p.redRisks > 0 || (p.targetPassed && p.calculated !== "G"));
  if (escalate.length) {
    items.push({
      id: "head-escalate",
      group: "now",
      weight: 35 + escalate.length,
      emphasis: `${count(escalate.length, "project needs", "projects need")} escalating upward.`,
      detail:
        escalate.length === 1
          ? `${escalate[0].name}: ${escalate[0].redRisks > 0 ? "it has an open red risk" : "it is past its target date and not Green"}.`
          : `${nameList(escalate.map((p) => p.name))}: each has a red risk, or is past target and not Green.`,
      action: escalate.length === 1 ? { label: "Open project", href: projectHref(escalate[0].id, "Register") } : { label: "See projects", href: "/projects" },
    });
  }

  const overdue = live.filter((p) => milestoneOverdue(p, now, tz));
  if (overdue.length) {
    items.push({
      id: "head-milestones",
      group: "now",
      weight: 30 + overdue.length,
      emphasis: `${count(overdue.length, "project has", "projects have")} an overdue milestone.`,
      detail: `${nameList(overdue.map((p) => p.name))}.`,
      action: overdue.length === 1 ? { label: "Open project", href: projectHref(overdue[0].id, "Delivery") } : { label: "See projects", href: "/projects" },
    });
  }

  const disputes = live.filter((p) => p.dispute);
  if (disputes.length) {
    items.push({
      id: "head-disputes",
      group: "wait",
      weight: 20 + disputes.length,
      emphasis: `${count(disputes.length, "project is", "projects are")} reported greener than ${plural(disputes.length, "it calculates", "they calculate")}.`,
      detail: `${nameList(disputes.map((p) => p.name))}. Check whether ${plural(disputes.length, "it is", "they are")} under-reporting.`,
      action: { label: "Open the week", href: "/reports" },
    });
  }

  const stale = live.filter((p) => p.freshnessDays > 14 && p.freshnessDays < 900);
  if (stale.length) {
    items.push({
      id: "head-stale",
      group: "wait",
      weight: 10 + stale.length,
      emphasis: `${count(stale.length, "status update is", "status updates are")} older than 14 days.`,
      detail: `Chase ${nameList(stale.map((p) => p.name), 2)}.`,
      action: { label: "Open the week", href: "/reports" },
    });
  }

  const ideas = extras.ideasNew;
  if (ideas && ideas.count > 0) {
    const age = ideas.oldestAt ? daysBetween(ideas.oldestAt, now, tz) : 0;
    items.push({
      id: "head-ideas",
      group: "wait",
      weight: 5 + ideas.count,
      emphasis: `${count(ideas.count, "idea is", "ideas are")} waiting for triage.`,
      detail: age > 0 ? `The oldest was submitted ${count(age, "day", "days")} ago.` : "Submitted today.",
      action: { label: "Triage", href: "/ideas" },
    });
  }

  const staffing = extras.staffingOpen;
  if (staffing && staffing.count > 0) {
    const age = staffing.oldestAt ? daysBetween(staffing.oldestAt, now, tz) : 0;
    items.push({
      id: "head-staffing",
      group: "wait",
      weight: 4 + staffing.count,
      emphasis: `${count(staffing.count, "staffing request is", "staffing requests are")} open.`,
      detail: staffing.count === 1 ? `Raised ${ageWords(age).replace(" old", " ago")}.` : `The oldest is ${ageWords(age)}.`,
      action: { label: "Open Staffing", href: "/staffing" },
    });
  }

  const over = extras.overbooked ?? [];
  if (over.length) {
    const top = [...over].sort((a, b) => b.pct - a.pct);
    items.push({
      id: "head-overbooked",
      group: "fyi",
      weight: over.length,
      emphasis: `${count(over.length, "person is", "people are")} booked over 100%.`,
      detail: over.length === 1 ? `${top[0].name} is at ${top[0].pct}%.` : `${nameList(top.map((o) => `${o.name} (${o.pct}%)`), 2)}.`,
      action: { label: "Open People", href: "/people" },
    });
  }
  return items;
}

const TESTING_GATES = new Set(["sit", "uat"]);

function qaItems({ projects, extras }: BriefInput): BriefItem[] {
  const live = active(projects);
  const crit = extras.criticalByProject ?? {};
  const items: BriefItem[] = [];

  for (const p of live) {
    const n = crit[p.id] ?? 0;
    const gate = p.currentGate?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
    if (n > 0 && TESTING_GATES.has(gate)) {
      items.push({
        id: `qa-gate-${p.id}`,
        group: "now",
        weight: 50 + n,
        emphasis: `${p.name} can't exit ${p.currentGate} yet.`,
        detail: `${count(n, "critical issue is", "critical issues are")} still open against it.`,
        action: { label: "Open issues", href: projectHref(p.id, "Register") },
      });
    }
  }

  const withCrit = live.filter((p) => (crit[p.id] ?? 0) > 0);
  const total = withCrit.reduce((s, p) => s + (crit[p.id] ?? 0), 0);
  if (total > 0) {
    const worst = [...withCrit].sort((a, b) => (crit[b.id] ?? 0) - (crit[a.id] ?? 0));
    items.push({
      id: "qa-critical",
      group: "wait",
      weight: 20 + total,
      emphasis: `${count(total, "critical issue is", "critical issues are")} open.`,
      detail: withCrit.length === 1 ? `All on ${worst[0].name}.` : `Most on ${worst[0].name}; ${count(withCrit.length, "project", "projects")} affected.`,
      action: { label: "See issues", href: "/risks" },
    });
  }

  // Low traceability before testing starts: coverage under 60% on a build-track project that
  // hasn't reached SIT yet.
  const preTest = new Set(["brd", "proto", "prototype", "mvp", "mvp1"]);
  const low = live
    .filter((p) => p.coveragePct !== null && p.coveragePct < 60)
    .filter((p) => preTest.has(p.currentGate?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? ""))
    .sort((a, b) => (a.coveragePct ?? 0) - (b.coveragePct ?? 0));
  for (const p of low) {
    items.push({
      id: `qa-coverage-${p.id}`,
      group: "fyi",
      weight: 100 - (p.coveragePct ?? 0),
      emphasis: `${p.name} has tests for only ${p.coveragePct}% of its requirements.`,
      detail: `It is at ${p.currentGate}; testing starts at SIT.`,
      action: { label: "Open project", href: projectHref(p.id, "Delivery") },
    });
  }
  return items;
}

function execItems({ projects }: BriefInput): BriefItem[] {
  const live = active(projects);
  const items: BriefItem[] = [];

  const atRisk = live.filter((p) => p.category === "Approved" && p.calculated === "R");
  if (atRisk.length) {
    items.push({
      id: "exec-at-risk",
      group: "now",
      weight: atRisk.length,
      emphasis: `${count(atRisk.length, "approved initiative is", "approved initiatives are")} at risk.`,
      detail: `${nameList(atRisk.map((p) => p.name))} ${plural(atRisk.length, "needs a Group decision", "need Group decisions")}.`,
      action: atRisk.length === 1 ? { label: "Open project", href: projectHref(atRisk[0].id) } : { label: "See projects", href: "/projects" },
    });
  }

  // The same rule as the Executive's "Decisions needing Group action" figure (exec.tsx). These
  // are worked out from project signals, not raised by people (D5), and the line says so.
  const decisions = live.filter((p) => p.redRisks > 0 || (p.dispute && p.targetPassed) || (p.calculated === "R" && p.freshnessDays > 7));
  if (decisions.length) {
    items.push({
      id: "exec-decisions",
      group: "now",
      weight: 10 + decisions.length,
      emphasis: `${count(decisions.length, "project may need", "projects may need")} a Group decision.`,
      detail: `${nameList(decisions.map((p) => p.name))}. Suggested from project signals.`,
      action: decisions.length === 1 ? { label: "Open project", href: projectHref(decisions[0].id) } : { label: "See projects", href: "/projects" },
    });
  }

  const hidden = live.filter((p) => p.dispute);
  if (hidden.length) {
    items.push({
      id: "exec-hidden",
      group: "wait",
      weight: hidden.length,
      emphasis: `Reported status hides ${count(hidden.length, "project", "projects")} in worse health.`,
      detail: "Calculated health has drifted from what PMs report.",
      action: { label: "See which", href: "/reports" },
    });
  }

  const liveCount = projects.filter((p) => p.status === "Completed").length;
  if (liveCount) {
    items.push({
      id: "exec-live",
      group: "fyi",
      weight: liveCount,
      emphasis: `${count(liveCount, "solution is", "solutions are")} live in production.`,
      detail: "Delivered across the approved portfolio.",
      action: { label: "See portfolios", href: "/portfolios" },
    });
  }
  return items;
}

function pmItems({ projects, extras, viewerId, now, timeZone: tz }: BriefInput): BriefItem[] {
  const mine = active(projects).filter((p) => p.pmIds.includes(viewerId));
  const items: BriefItem[] = [];

  for (const p of mine) {
    if (milestoneOverdue(p, now, tz)) {
      const ms = p.nextMilestone!;
      const late = daysBetween(ms.dueDate!, now, tz);
      items.push({
        id: `pm-ms-${p.id}`,
        group: "now",
        weight: 100 + late,
        emphasis: `${p.name} has a milestone overdue.`,
        detail: `${ms.name} was due ${formatDayMonth(ms.dueDate!, tz)}. Re-baseline it or record why it slipped before Friday's check-in.`,
        action: { label: "Update", href: projectHref(p.id, "Delivery") },
      });
    }
    if (p.redRisks > 0) {
      const top = p.risks.find((r) => r.severity === "R");
      items.push({
        id: `pm-risk-${p.id}`,
        group: "now",
        weight: 50 + p.redRisks,
        emphasis: `${p.name} has ${p.redRisks === 1 ? "an open red risk" : `${p.redRisks} open red risks`}.`,
        detail: `${top ? `${top.title.replace(/\.$/, "")}. ` : ""}Escalate it to your Head if you can't close it.`,
        action: { label: "Review risk", href: projectHref(p.id, "Register") },
      });
    }
    if (p.dispute) {
      items.push({
        id: `pm-dispute-${p.id}`,
        group: "wait",
        weight: 30,
        emphasis: `${p.name} is reported ${RAG_WORD[p.reported]} but calculates ${RAG_WORD[p.calculated]}.`,
        detail: "Change the rating or add a justification.",
        action: { label: "Resolve", href: projectHref(p.id, "This week") },
      });
    }
    if (p.openBlockers > 0) {
      items.push({
        id: `pm-blockers-${p.id}`,
        group: "wait",
        weight: 20 + p.openBlockers,
        emphasis: `${p.name} has ${count(p.openBlockers, "open blocker", "open blockers")}.`,
        detail: `Your team is waiting on ${plural(p.openBlockers, "it", "them")}.`,
        action: { label: "Open blockers", href: projectHref(p.id, "Register") },
      });
    }
  }

  // This week's status updates not yet sent to the Head. Friday 17:00 is the deadline: from
  // Friday on (tenant time) it's action now; earlier in the week it's a heads-up.
  if (extras.checkInsSent) {
    const sent = new Set(extras.checkInsSent);
    const unsent = mine.filter((p) => !sent.has(p.id));
    if (unsent.length) {
      const late = weekdayIn(now, tz) >= 5;
      items.push({
        id: "pm-updates",
        group: late ? "now" : "fyi",
        weight: late ? 40 + unsent.length : unsent.length,
        emphasis: late
          ? `${count(unsent.length, "weekly update hasn't", "weekly updates haven't")} been sent.`
          : `${count(unsent.length, "weekly update is", "weekly updates are")} due Friday at 17:00.`,
        detail: `${nameList(unsent.map((p) => p.name), 2)}.`,
        action: { label: "Open updates", href: "/reports" },
      });
    }
  }
  return items;
}

function memberItems({ extras, now, timeZone: tz }: BriefInput): BriefItem[] {
  const tasks = extras.myTasks ?? [];
  const items: BriefItem[] = [];
  const today = dayKey(now, tz);
  const tomorrow = dayKey(new Date(Date.parse(`${today}T12:00:00Z`) + DAY_MS), "UTC");
  const taskHref = (t: BriefTask) => `/projects/${t.projectId}?tab=Board&task=${t.id}`;

  const overdue = tasks.filter((t) => t.dueDate && isOverdue(t.dueDate, now, tz)).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
  if (overdue.length === 1) {
    const t = overdue[0];
    items.push({
      id: `m-overdue-${t.id}`,
      group: "now",
      weight: 100,
      emphasis: `One task is overdue: ${t.title}.`,
      detail: `${t.projectName}, due ${formatDayMonth(t.dueDate!, tz)}.`,
      action: { label: "Open task", href: taskHref(t) },
    });
  } else if (overdue.length > 1) {
    items.push({
      id: "m-overdue",
      group: "now",
      weight: 100 + overdue.length,
      emphasis: `${overdue.length} tasks are overdue.`,
      detail: `${nameList(overdue.map((t) => t.title), 2)}.`,
      action: { label: "Open tasks", href: "/my-tasks" },
    });
  }

  for (const t of tasks.filter((x) => x.blockedSince)) {
    items.push({
      id: `m-blocked-${t.id}`,
      group: "wait",
      weight: daysBetween(t.blockedSince!, now, tz),
      emphasis: `${t.title} has been blocked since ${formatDayMonth(t.blockedSince!, tz)}.`,
      detail: `${t.blockerText ? `${t.blockerText.replace(/\.$/, "")}. ` : ""}Your PM can see this blocker.`,
      action: { label: "Open task", href: taskHref(t) },
    });
  }

  const dueToday = tasks.filter((t) => t.dueDate && dayKey(t.dueDate, tz) === today);
  const dueTomorrow = tasks.filter((t) => t.dueDate && dayKey(t.dueDate, tz) === tomorrow);
  if (dueToday.length) {
    items.push({
      id: "m-today",
      group: "wait",
      weight: 10 + dueToday.length,
      emphasis: `${count(dueToday.length, "task is", "tasks are")} due today.`,
      detail: `${nameList(dueToday.map((t) => t.title), 2)}.`,
      action: dueToday.length === 1 ? { label: "Open task", href: taskHref(dueToday[0]) } : { label: "Open tasks", href: "/my-tasks" },
    });
  }
  if (dueTomorrow.length) {
    items.push({
      id: "m-tomorrow",
      group: "fyi",
      weight: dueTomorrow.length,
      emphasis: `${count(dueTomorrow.length, "task is", "tasks are")} due tomorrow.`,
      detail: `${nameList(dueTomorrow.map((t) => t.title), 2)}.`,
      action: dueTomorrow.length === 1 ? { label: "Open task", href: taskHref(dueTomorrow[0]) } : { label: "Open tasks", href: "/my-tasks" },
    });
  }
  return items;
}

const RULES: Record<ViewRole, (input: BriefInput) => BriefItem[]> = {
  [SUPER_ADMIN]: superAdminItems,
  Executive: execItems,
  HeadOfProjects: headItems,
  HeadOfQA: qaItems,
  ProjectManager: pmItems,
  Member: memberItems,
} as Record<ViewRole, (input: BriefInput) => BriefItem[]>;

const GROUP_ORDER: Record<BriefGroup, number> = { now: 0, wait: 1, fyi: 2 };

/** Ranked: group (now → wait → fyi), then weight (heavier first), then text for stability. */
export function rankBrief(items: BriefItem[]): BriefItem[] {
  return [...items].sort(
    (a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || b.weight - a.weight || a.emphasis.localeCompare(b.emphasis),
  );
}

/** The whole Brief for one role: every qualifying item, ranked. */
export function buildBrief(input: BriefInput): Brief {
  const rule = RULES[input.role] ?? memberItems;
  return { items: rankBrief(rule(input)), generatedAt: input.now };
}

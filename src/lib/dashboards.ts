// Per-role dashboard composition (PROMPT §4). ONE dashboard shell; each canonical role
// selects an ordered set of widgets from a shared library. No six divergent pages — the
// /dashboard route renders `DASHBOARDS[view].widgets`. Landing + the role-switcher pills use
// the priority order below. Pure/config-only so it's unit-testable (see dashboards.test.ts).

export type DashboardRole =
  | "PlatformSuperAdmin"
  | "HeadOfProjects"
  | "HeadOfQA"
  | "Executive"
  | "ProjectManager"
  | "Member";

// Widgets the shell knows how to render. Keys map to components in the /dashboard renderer.
// `*:stub` widgets depend on models that don't exist yet (join requests → Phase 3 flow,
// plan approvals → Phase 5) and render a clearly-labelled empty placeholder for now.
export type DashboardWidget =
  | "briefing" // getBriefing hero — on every dashboard
  | "kpi-strip"
  | "health-ring"
  | "rag-heatmap"
  | "delivery-ledger"
  | "projects-at-risk"
  | "my-projects"
  | "critical-blockers"
  | "upcoming-milestones"
  | "budget-rollup"
  | "workload"
  | "leadless-projects"
  | "issues-by-severity"
  | "blocked-in-test"
  | "my-risks-blockers"
  | "admin-insights"
  | "ai-usage"
  | "join-requests:stub"
  | "plan-approvals:stub";

export interface DashboardDef {
  role: DashboardRole;
  /** Label for the role-switcher pill and the hero eyebrow. */
  label: string;
  /** Where this role lands after sign-in. Member goes to My Tasks (§6); others compose here. */
  landing: "/dashboard" | "/my-tasks";
  /** Whether the dashboard shows operational write affordances. Executive is read-only (§4). */
  readOnly: boolean;
  widgets: DashboardWidget[];
}

// Landing / role-switcher priority (PROMPT §4): SuperAdmin → Heads → Executive → PM → Member.
const PRIORITY: DashboardRole[] = [
  "PlatformSuperAdmin",
  "HeadOfProjects",
  "HeadOfQA",
  "Executive",
  "ProjectManager",
  "Member",
];

export const DASHBOARDS: Record<DashboardRole, DashboardDef> = {
  PlatformSuperAdmin: {
    role: "PlatformSuperAdmin",
    label: "Super Admin",
    landing: "/dashboard",
    readOnly: false,
    widgets: ["briefing", "admin-insights", "ai-usage", "kpi-strip", "delivery-ledger"],
  },
  HeadOfProjects: {
    role: "HeadOfProjects",
    label: "Head of Projects",
    landing: "/dashboard",
    readOnly: false,
    widgets: ["briefing", "kpi-strip", "delivery-ledger", "leadless-projects", "workload", "plan-approvals:stub"],
  },
  HeadOfQA: {
    role: "HeadOfQA",
    label: "Head of QA",
    landing: "/dashboard",
    readOnly: false,
    widgets: ["briefing", "blocked-in-test", "issues-by-severity", "workload", "upcoming-milestones"],
  },
  Executive: {
    role: "Executive",
    label: "Executive",
    landing: "/dashboard",
    readOnly: true,
    widgets: ["briefing", "kpi-strip", "rag-heatmap", "projects-at-risk", "critical-blockers", "upcoming-milestones", "budget-rollup"],
  },
  ProjectManager: {
    role: "ProjectManager",
    label: "Project Manager",
    landing: "/dashboard",
    readOnly: false,
    widgets: ["briefing", "my-projects", "my-risks-blockers", "workload", "upcoming-milestones", "join-requests:stub"],
  },
  Member: {
    role: "Member",
    label: "My Tasks",
    landing: "/my-tasks",
    readOnly: false,
    widgets: ["briefing"],
  },
};

/** The dashboard a user lands on after sign-in — their highest-priority role (§4). */
export function primaryDashboard(roles: string[]): DashboardRole {
  return PRIORITY.find((r) => roles.includes(r)) ?? "Member";
}

/** Dashboards a user may view, highest-priority first (drives the role-switcher pills). */
export function accessibleDashboards(roles: string[]): DashboardRole[] {
  const held = PRIORITY.filter((r) => roles.includes(r));
  return held.length ? held : ["Member"];
}

/** Resolve a requested `?view=` to a dashboard the user may actually see, else their primary. */
export function resolveView(roles: string[], requested?: string | null): DashboardRole {
  const allowed = accessibleDashboards(roles);
  if (requested && (allowed as string[]).includes(requested)) return requested as DashboardRole;
  return primaryDashboard(roles);
}

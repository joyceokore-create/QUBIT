// Custom Reports (docs/16 §9 successor) — the CLIENT-SAFE registry of reportable
// datasets and their columns. The builder UI renders this list directly ("all available
// columns"); the server engine (src/server/custom-reports.ts) binds each dataset to a
// tenant-scoped query and validates every requested column key against this allow-list,
// so a column the registry doesn't name can never be fetched or exported.
//
// Value sets: most entity "enums" are Strings in the schema, not Prisma enums — the
// column metadata carries the allowed values for the UI. Project sets import from the
// shared client-safe source; risk/issue/task sets mirror their server constants
// (src/server/risks.ts RISK_STATUSES, src/server/issues.ts ISSUE_STATUSES — server
// modules, so the literals are mirrored here rather than imported into client code).

import { PIPELINE_STAGES, PROJECT_PRIORITIES, PROJECT_STATUS_WORDS, TASK_STATUS_WORDS } from "@/lib/project-enums";

export type ReportDatasetKey =
  | "projects"
  | "portfolios"
  | "programmes"
  | "risks"
  | "issues"
  | "tasks"
  | "workload"
  // UX6 (UX plan D13) — the "My …" datasets: always scoped to the signed-in person's own
  // rows, so they are the whole of a Member's Reports page (Members hold no reports:read).
  | "myTasks"
  | "myProjects"
  | "myBlockers"
  // UX11 (D13) — Super Admin datasets: the user directory (admin:access) and the
  // request-access queue (iam:manage). Offered only to viewers holding the gate.
  | "users"
  | "accessRequests"
  // UX fidelity Tier 3 — the design's builder datasets: risks and issues in one list, the
  // weekly check-ins, milestones, requirements and the QA queue's test tasks.
  | "riskIssues"
  | "milestones"
  | "checkins"
  | "requirements"
  | "testTasks";

export type ReportColumnType = "text" | "number" | "date" | "enum" | "boolean";

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
  /** For enum columns: the value set, shown as a hint in the picker. */
  values?: readonly string[];
}

export interface ReportDataset {
  key: ReportDatasetKey;
  label: string;
  /** The app module (src/lib/catalogue.ts) this dataset reports over — groups the picker. */
  moduleLabel: string;
  description: string;
  columns: ReportColumn[];
  /** Pre-ticked columns for a fresh builder. Must be a subset of `columns`. */
  defaults: string[];
}

const RISK_STATUSES = ["Open", "Monitoring", "Mitigated", "Closed"] as const;
const ISSUE_STATUSES = ["Open", "Investigating", "Resolved", "Closed"] as const;
const TASK_STATUSES = TASK_STATUS_WORDS;
const TASK_TYPES = ["Feature", "Bug", "Chore", "Spike", "Improvement"] as const;
const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
const CATEGORIES = ["Approved", "Exploring", "Shelved"] as const;
const BLOCKER_STATUSES = ["Open", "Resolved"] as const;
const BLOCKER_SEVERITIES = ["Low", "Medium", "Critical"] as const;
/** User statuses a report can show (DELETED users never appear). */
export const USER_REPORT_STATUSES = ["Active", "Invited", "Suspended"] as const;
/** The users report's MFA cell: app-level TOTP set or not; "SSO" when the identity provider
 *  enforces MFA (the app can't observe it). A status, never the secret. */
export const USER_REPORT_MFA = ["On", "Off", "SSO"] as const;
const RAID_TYPES = ["Risk", "Issue"] as const;
const MILESTONE_STATUSES = ["Pending", "Done"] as const;
const CHECKIN_STATUSES = ["Draft", "Confirmed"] as const;
const HEALTH_WORDS = ["On track", "At risk", "Off track", "Not rated"] as const;
const REQUIREMENT_STATUSES = ["Accepted", "Rejected"] as const;
export const ACCESS_REQUEST_REPORT_STATUSES = ["New", "Reviewed", "Dismissed"] as const;

export const REPORT_DATASETS: ReportDataset[] = [
  {
    key: "projects",
    label: "Projects",
    moduleLabel: "Projects & delivery",
    description: "One row per project — delivery status, priority, ownership and dates.",
    columns: [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Project name", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "client", label: "Client", type: "text" },
      { key: "businessOwner", label: "Business owner", type: "text" },
      { key: "type", label: "Type", type: "text" },
      { key: "status", label: "Status", type: "enum", values: PROJECT_STATUS_WORDS },
      { key: "priority", label: "Priority", type: "enum", values: PROJECT_PRIORITIES },
      { key: "pipelineStage", label: "Pipeline stage", type: "enum", values: PIPELINE_STAGES },
      { key: "portfolio", label: "Portfolio", type: "text" },
      { key: "programme", label: "Programme", type: "text" },
      { key: "lead", label: "Project lead", type: "text" },
      { key: "startDate", label: "Start date", type: "date" },
      { key: "dueDate", label: "Target date", type: "date" },
      { key: "budget", label: "Budget", type: "text" },
      { key: "statusNote", label: "Status note", type: "text" },
      { key: "markets", label: "Markets", type: "text" },
      { key: "createdAt", label: "Created", type: "date" },
    ],
    defaults: ["code", "name", "status", "priority", "portfolio", "lead", "dueDate"],
  },
  {
    key: "portfolios",
    label: "Portfolios",
    moduleLabel: "Portfolios & programmes",
    description: "One row per portfolio — category, ownership and size.",
    columns: [
      { key: "name", label: "Portfolio name", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "category", label: "Category", type: "enum", values: CATEGORIES },
      { key: "viewKind", label: "View kind", type: "enum", values: ["Pipeline", "Rollout"] },
      { key: "owner", label: "Owner", type: "text" },
      { key: "targetBudget", label: "Target budget", type: "text" },
      { key: "programmes", label: "Programmes", type: "number" },
      { key: "projects", label: "Projects", type: "number" },
      { key: "createdAt", label: "Created", type: "date" },
    ],
    defaults: ["name", "category", "owner", "projects"],
  },
  {
    key: "programmes",
    label: "Programmes",
    moduleLabel: "Portfolios & programmes",
    description: "One row per programme — status, parent portfolio and size.",
    columns: [
      { key: "name", label: "Programme name", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "category", label: "Category", type: "enum", values: CATEGORIES },
      { key: "portfolio", label: "Portfolio", type: "text" },
      { key: "budget", label: "Budget", type: "text" },
      { key: "projects", label: "Projects", type: "number" },
      { key: "createdAt", label: "Created", type: "date" },
    ],
    defaults: ["name", "status", "portfolio", "projects"],
  },
  {
    key: "risks",
    label: "Risks",
    moduleLabel: "Risks & issues",
    description: "One row per risk — probability × impact, owner and mitigation.",
    columns: [
      { key: "title", label: "Title", type: "text" },
      { key: "project", label: "Project", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "probability", label: "Probability (1–5)", type: "number" },
      { key: "impact", label: "Impact (1–5)", type: "number" },
      { key: "score", label: "Score", type: "number" },
      { key: "status", label: "Status", type: "enum", values: RISK_STATUSES },
      { key: "owner", label: "Owner", type: "text" },
      { key: "mitigation", label: "Mitigation", type: "text" },
      { key: "materialised", label: "Materialised", type: "boolean" },
      { key: "createdAt", label: "Raised", type: "date" },
    ],
    defaults: ["title", "project", "score", "status", "owner"],
  },
  {
    key: "issues",
    label: "Issues",
    moduleLabel: "Risks & issues",
    description: "One row per issue — severity, status and origin risk.",
    columns: [
      { key: "ref", label: "ID", type: "text" },
      { key: "title", label: "Title", type: "text" },
      { key: "project", label: "Project", type: "text" },
      { key: "severity", label: "Severity", type: "text" },
      { key: "status", label: "Status", type: "enum", values: ISSUE_STATUSES },
      { key: "owner", label: "Owner", type: "text" },
      { key: "originRisk", label: "Origin risk", type: "text" },
      { key: "createdAt", label: "Raised", type: "date" },
    ],
    defaults: ["ref", "title", "project", "severity", "status", "owner"],
  },
  {
    key: "riskIssues",
    label: "Risks & Issues",
    moduleLabel: "Risks & issues",
    description: "Risks and issues in one list — what kind, how serious, who owns it and how old it is.",
    columns: [
      { key: "ref", label: "ID", type: "text" },
      { key: "kind", label: "Type", type: "enum", values: RAID_TYPES },
      { key: "title", label: "Title", type: "text" },
      { key: "project", label: "Project", type: "text" },
      { key: "severity", label: "Severity", type: "text" },
      { key: "score", label: "Risk score", type: "number" },
      { key: "status", label: "Status", type: "text" },
      { key: "owner", label: "Owner", type: "text" },
      { key: "createdAt", label: "Raised", type: "date" },
      { key: "ageDays", label: "Age (days)", type: "number" },
    ],
    defaults: ["ref", "kind", "title", "project", "severity", "status", "owner"],
  },
  {
    key: "milestones",
    label: "Milestones",
    moduleLabel: "Projects & delivery",
    description: "One row per project milestone, with its market, due date and whether it is late.",
    columns: [
      { key: "project", label: "Project", type: "text" },
      { key: "name", label: "Milestone", type: "text" },
      { key: "market", label: "Market", type: "text" },
      { key: "dueDate", label: "Due", type: "date" },
      { key: "status", label: "Status", type: "enum", values: MILESTONE_STATUSES },
      { key: "late", label: "Late", type: "boolean" },
      { key: "tasks", label: "Linked tasks", type: "number" },
    ],
    defaults: ["project", "name", "market", "dueDate", "status", "late"],
  },
  {
    key: "checkins",
    label: "Check-ins",
    moduleLabel: "Reports",
    description: "One row per project per week — the computed status, the PM's rating and when it went to the Head.",
    columns: [
      { key: "project", label: "Project", type: "text" },
      { key: "week", label: "Week", type: "text" },
      { key: "status", label: "Update", type: "enum", values: CHECKIN_STATUSES },
      { key: "computed", label: "Computed status", type: "enum", values: HEALTH_WORDS },
      { key: "rating", label: "PM rating", type: "enum", values: HEALTH_WORDS },
      { key: "reason", label: "Reason for the rating", type: "text" },
      { key: "narrative", label: "Line for the Head", type: "text" },
      { key: "confirmedBy", label: "Confirmed by", type: "text" },
      { key: "confirmedAt", label: "Confirmed", type: "date" },
      { key: "sentAt", label: "Sent to the Head", type: "date" },
    ],
    defaults: ["project", "week", "status", "computed", "rating", "sentAt"],
  },
  {
    key: "requirements",
    label: "Requirements",
    moduleLabel: "Projects & delivery",
    description: "One row per requirement, with whether a published task covers it.",
    columns: [
      { key: "ref", label: "ID", type: "text" },
      { key: "text", label: "Requirement", type: "text" },
      { key: "project", label: "Project", type: "text" },
      { key: "status", label: "Status", type: "enum", values: REQUIREMENT_STATUSES },
      { key: "section", label: "Source section", type: "text" },
      { key: "covered", label: "Covered", type: "boolean" },
      { key: "linkedTasks", label: "Linked tasks", type: "number" },
      { key: "createdAt", label: "Added", type: "date" },
    ],
    defaults: ["ref", "text", "project", "covered"],
  },
  {
    key: "testTasks",
    label: "Test tasks",
    moduleLabel: "Projects & delivery",
    description: "The QA queue: tasks in a test phase, in review or QA, and bugs — open and done.",
    columns: [
      { key: "key", label: "Key", type: "text" },
      { key: "title", label: "Title", type: "text" },
      { key: "project", label: "Project", type: "text" },
      { key: "type", label: "Type", type: "enum", values: TASK_TYPES },
      { key: "status", label: "Status", type: "enum", values: TASK_STATUSES },
      { key: "phase", label: "Phase", type: "text" },
      { key: "assignee", label: "Assignee", type: "text" },
      { key: "dueDate", label: "Due date", type: "date" },
    ],
    defaults: ["key", "title", "project", "status", "phase", "assignee", "dueDate"],
  },
  {
    key: "tasks",
    label: "Tasks",
    moduleLabel: "Projects & delivery",
    description:
      "One row per published task across every project you can see (draft tasks and board lanes outside your lens are excluded, exactly as on the boards).",
    columns: [
      { key: "key", label: "Key", type: "text" },
      { key: "title", label: "Title", type: "text" },
      { key: "project", label: "Project", type: "text" },
      { key: "type", label: "Type", type: "enum", values: TASK_TYPES },
      { key: "status", label: "Status", type: "enum", values: TASK_STATUSES },
      { key: "priority", label: "Priority", type: "enum", values: TASK_PRIORITIES },
      { key: "severity", label: "Severity", type: "text" },
      { key: "phase", label: "Phase", type: "text" },
      { key: "assignee", label: "Assignee", type: "text" },
      { key: "milestone", label: "Milestone", type: "text" },
      { key: "estimate", label: "Estimate", type: "text" },
      { key: "dueDate", label: "Due date", type: "date" },
      { key: "source", label: "Source", type: "text" },
      { key: "lastActivityAt", label: "Last activity", type: "date" },
    ],
    defaults: ["key", "title", "project", "status", "priority", "assignee", "dueDate"],
  },
  {
    key: "workload",
    label: "People & workload",
    moduleLabel: "Teams & people",
    description:
      "One row per person — allocation across projects, leave-aware. Without the report-on-others permission you see only your own row.",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "department", label: "Department", type: "text" },
      { key: "projects", label: "Projects", type: "number" },
      { key: "allocatedPct", label: "Allocated %", type: "number" },
      { key: "effectivePct", label: "Effective % (leave-aware)", type: "number" },
      { key: "onLeaveUntil", label: "On leave until", type: "date" },
      { key: "allocations", label: "Allocations", type: "text" },
    ],
    defaults: ["name", "department", "projects", "allocatedPct", "effectivePct"],
  },
  {
    key: "myTasks",
    label: "My tasks",
    moduleLabel: "My work",
    description: "One row per published task assigned to you, done ones included.",
    columns: [
      { key: "title", label: "Task", type: "text" },
      { key: "key", label: "Key", type: "text" },
      { key: "project", label: "Project", type: "text" },
      { key: "status", label: "Status", type: "enum", values: TASK_STATUSES },
      { key: "dueDate", label: "Due", type: "date" },
      { key: "estimate", label: "Estimate", type: "text" },
      { key: "priority", label: "Priority", type: "enum", values: TASK_PRIORITIES },
      { key: "type", label: "Type", type: "enum", values: TASK_TYPES },
      { key: "blocked", label: "Blocked", type: "boolean" },
      { key: "phase", label: "Phase", type: "text" },
      { key: "milestone", label: "Milestone", type: "text" },
      { key: "lastActivityAt", label: "Last activity", type: "date" },
    ],
    defaults: ["title", "key", "project", "status", "dueDate", "priority", "blocked"],
  },
  {
    key: "myProjects",
    label: "My projects",
    moduleLabel: "My work",
    description: "One row per project you are a member of or lead.",
    columns: [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Project", type: "text" },
      { key: "role", label: "Your role", type: "text" },
      { key: "status", label: "Status", type: "enum", values: PROJECT_STATUS_WORDS },
      { key: "dueDate", label: "Target date", type: "date" },
      { key: "openTasks", label: "Open tasks of mine", type: "number" },
      { key: "lead", label: "Project lead", type: "text" },
      { key: "portfolio", label: "Portfolio", type: "text" },
      { key: "priority", label: "Priority", type: "enum", values: PROJECT_PRIORITIES },
    ],
    defaults: ["code", "name", "role", "status", "dueDate", "openTasks"],
  },
  {
    key: "myBlockers",
    label: "Blockers I raised",
    moduleLabel: "My work",
    description: "One row per blocker you raised, open and resolved.",
    columns: [
      { key: "description", label: "Blocker", type: "text" },
      { key: "project", label: "Project", type: "text" },
      { key: "task", label: "Task", type: "text" },
      { key: "severity", label: "Severity", type: "enum", values: BLOCKER_SEVERITIES },
      { key: "status", label: "Status", type: "enum", values: BLOCKER_STATUSES },
      { key: "dateRaised", label: "Raised", type: "date" },
      { key: "owner", label: "Who can unblock", type: "text" },
      { key: "resolutionNotes", label: "Resolved notes", type: "text" },
    ],
    defaults: ["description", "project", "task", "status", "dateRaised", "owner"],
  },
  {
    key: "users",
    label: "Users",
    moduleLabel: "Admin & access",
    description: "One row per user in your organisation — roles, department, status, MFA and teams. Deleted users are excluded.",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "roles", label: "Roles", type: "text" },
      { key: "department", label: "Department", type: "text" },
      { key: "status", label: "Status", type: "enum", values: USER_REPORT_STATUSES },
      { key: "mfa", label: "MFA", type: "enum", values: USER_REPORT_MFA },
      { key: "lastActive", label: "Last active", type: "date" },
      { key: "createdAt", label: "Created", type: "date" },
      { key: "teams", label: "Teams", type: "text" },
    ],
    defaults: ["name", "email", "roles", "department", "status", "mfa", "lastActive"],
  },
  {
    key: "accessRequests",
    label: "Access requests",
    moduleLabel: "Admin & access",
    description: "One row per request from the public request-access form, newest first within each status.",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "company", label: "Company", type: "text" },
      { key: "jobTitle", label: "Job title", type: "text" },
      { key: "status", label: "Status", type: "enum", values: ACCESS_REQUEST_REPORT_STATUSES },
      { key: "submittedAt", label: "Submitted", type: "date" },
      { key: "reviewedAt", label: "Reviewed at", type: "date" },
    ],
    defaults: ["name", "email", "company", "status", "submittedAt"],
  },
];

/** The admin datasets (UX11): tenant users and the system access-request queue. */
export const ADMIN_DATASET_KEYS = ["users", "accessRequests"] as const satisfies readonly ReportDatasetKey[];

/** The "My …" datasets (UX6): the only ones offered to a viewer without reports:read. */
export const MY_DATASET_KEYS = ["myTasks", "myProjects", "myBlockers"] as const satisfies readonly ReportDatasetKey[];

/** My projects' "Your role": "Project lead" when I lead it, then my membership role(s),
 * de-duplicated case-insensitively, in order; null when neither (never expected). */
export function myProjectRole(isLead: boolean, memberRoles: string[]): string | null {
  const out: string[] = isLead ? ["Project lead"] : [];
  for (const r of memberRoles) {
    const role = r.trim();
    if (role && !out.some((o) => o.toLowerCase() === role.toLowerCase())) out.push(role);
  }
  return out.length ? out.join(", ") : null;
}

export const REPORT_DATASET_KEYS = REPORT_DATASETS.map((d) => d.key);

export function reportDataset(key: ReportDatasetKey): ReportDataset {
  const found = REPORT_DATASETS.find((d) => d.key === key);
  if (!found) throw new Error(`Unknown report dataset: ${key}`);
  return found;
}

/**
 * UX fidelity Tier 3 — the datasets the builder lists first for each "Viewing as" role (the
 * design's Dataset card). Everything else the viewer may run sits under "More Datasets".
 * Presentation only: the offered set still comes from offeredDatasetKeys on the server.
 */
export const FEATURED_DATASETS: Record<string, ReportDatasetKey[]> = {
  PlatformSuperAdmin: ["users", "accessRequests", "projects", "riskIssues", "checkins"],
  HeadOfProjects: ["projects", "riskIssues", "checkins", "milestones"],
  Executive: ["projects", "riskIssues", "checkins", "milestones"],
  ProjectManager: ["projects", "riskIssues", "checkins", "milestones"],
  HeadOfQA: ["projects", "riskIssues", "requirements", "testTasks"],
  Member: ["myTasks", "myProjects", "myBlockers"],
};

/** Split the offered datasets into the role's featured ones (in design order) and the rest. */
export function splitDatasets(offered: readonly ReportDatasetKey[], viewRole: string | null | undefined): { featured: ReportDatasetKey[]; more: ReportDatasetKey[] } {
  const want = (viewRole && FEATURED_DATASETS[viewRole]) || FEATURED_DATASETS.ProjectManager;
  const featured = want.filter((k) => offered.includes(k));
  if (featured.length === 0) return { featured: [...offered], more: [] };
  return { featured, more: offered.filter((k) => !featured.includes(k)) };
}

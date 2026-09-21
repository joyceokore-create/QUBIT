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

import { PIPELINE_STAGES, PROJECT_PRIORITIES, PROJECT_STATUSES } from "@/lib/project-enums";

export type ReportDatasetKey =
  | "projects"
  | "portfolios"
  | "programmes"
  | "risks"
  | "issues"
  | "tasks"
  | "workload";

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
const TASK_STATUSES = ["NotStarted", "InProgress", "Blocked", "Completed"] as const;
const TASK_TYPES = ["Feature", "Bug", "Chore", "Spike", "Improvement"] as const;
const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
const CATEGORIES = ["Approved", "Exploring", "Shelved"] as const;

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
      { key: "status", label: "Status", type: "enum", values: PROJECT_STATUSES },
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
      { key: "title", label: "Title", type: "text" },
      { key: "project", label: "Project", type: "text" },
      { key: "severity", label: "Severity", type: "text" },
      { key: "status", label: "Status", type: "enum", values: ISSUE_STATUSES },
      { key: "owner", label: "Owner", type: "text" },
      { key: "originRisk", label: "Origin risk", type: "text" },
      { key: "createdAt", label: "Raised", type: "date" },
    ],
    defaults: ["title", "project", "severity", "status", "owner"],
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
];

export const REPORT_DATASET_KEYS = REPORT_DATASETS.map((d) => d.key);

export function reportDataset(key: ReportDatasetKey): ReportDataset {
  const found = REPORT_DATASETS.find((d) => d.key === key);
  if (!found) throw new Error(`Unknown report dataset: ${key}`);
  return found;
}

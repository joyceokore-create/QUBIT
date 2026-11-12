// Client-safe project enums — the single source of truth shared by server zod schemas
// (src/server/projects.ts) and every client dialog/editor. DM1.73: the edit-project
// dialog previously hardcoded a stale ["Low","Medium","High","Critical"] list; picking
// "Medium"/"Critical" failed the server enum and silently discarded the whole save.
export const PROJECT_STATUSES = ["Planning", "OnTrack", "AtRisk", "Overdue", "Completed", "Cancelled"] as const;
// docs/18 §1 — business usage; legacy Medium/Critical were remapped by the M18-A migration.
export const PROJECT_PRIORITIES = ["High", "Med", "Low", "New", "Strat", "Paused"] as const;
// docs/18 §1 — the real pipeline. Stage changes are audited + evented.
export const PIPELINE_STAGES = ["Exploring", "Evaluating", "Approved", "Paused"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** UX fidelity (D-F2): the words people read for a project status, in reports and exports. */
export const PROJECT_STATUS_LABEL: Record<string, string> = {
  Planning: "Planning",
  OnTrack: "On track",
  AtRisk: "At risk",
  Overdue: "Off track",
  Completed: "Completed",
  Cancelled: "Cancelled",
};
export const PROJECT_STATUS_WORDS = ["Planning", "On track", "At risk", "Off track", "Completed", "Cancelled"] as const;

/** Task status words for reports and exports. */
export const TASK_STATUS_LABEL: Record<string, string> = {
  NotStarted: "Not started",
  InProgress: "In progress",
  InReview: "In review",
  InQA: "In QA",
  Blocked: "Blocked",
  Completed: "Completed",
  Cancelled: "Cancelled",
};
export const TASK_STATUS_WORDS = ["Not started", "In progress", "Blocked", "Completed"] as const;

export const projectStatusLabel = (s: string) => PROJECT_STATUS_LABEL[s] ?? s;
export const taskStatusLabel = (s: string) => TASK_STATUS_LABEL[s] ?? s;

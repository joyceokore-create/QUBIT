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

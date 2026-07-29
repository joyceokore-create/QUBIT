import type { UserGroup } from "@/lib/personas";

/**
 * Widget registry + presets (docs/17 §0). A preset is an ORDERED list of widget keys;
 * widgets shared between presets are the same component reading the same engines —
 * no per-role math forks. M1a ships the executive preset; developer/PM land in M1b and
 * QA/implementor in M1c — until then those personas render the interim "v2" sections
 * (a real, working dashboard — never a placeholder, per §9).
 */

export const WIDGETS = {
  "exec-hero": { title: "Briefing hero" },
  "health-trend": { title: "Health trend" },
  "decision-queue": { title: "Decision queue" },
  // Amended docs/18 §6: ONE portfolio-grouped section list shared by every persona —
  // it absorbed the flat pipeline table, the KPI strip (per-row chips), the org heatmap
  // (per-section RAG+Δ) and the milestones/risks panels (per-row chips).
  "portfolio-sections": { title: "Portfolios · grouped by health" },
  "changed-since": { title: "Since you last looked" },
  "focus-task": { title: "Focus task" },
  "queue-buckets": { title: "Queue buckets" },
  "done-this-week": { title: "Done this week" },
  "pm-hero": { title: "Check-in status hero" },
  "action-queue": { title: "Action queue" },
  "team-load": { title: "Team load" },
} as const;

export type WidgetKey = keyof typeof WIDGETS;

/** Amended 18 §6 order: hero|health-trend → decision queue → portfolio sections. */
export const EXECUTIVE_PRESET: WidgetKey[] = [
  "exec-hero",
  "health-trend",
  "decision-queue",
  "portfolio-sections",
  "changed-since",
];

/** §4 order: one decision made for you, then the queue, then context (scope=mine). */
export const DEVELOPER_PRESET: WidgetKey[] = ["focus-task", "queue-buckets", "portfolio-sections", "done-this-week"];

/** §3 order: this week's ritual first, projects (scope toggle), then what's stuck on you. */
export const PM_PRESET: WidgetKey[] = ["pm-hero", "portfolio-sections", "action-queue", "team-load"];

/** Personas with a dedicated preset today. Everyone else gets the interim v2 sections. */
export const BUILT_PRESETS: Partial<Record<UserGroup, WidgetKey[]>> = {
  executive: EXECUTIVE_PRESET,
  developer: DEVELOPER_PRESET,
  pm: PM_PRESET,
};

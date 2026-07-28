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
  "exec-kpis": { title: "KPI row" },
  "decision-queue": { title: "Decision queue" },
  "portfolio-heatmap": { title: "Portfolio heatmap" },
  "milestones-30d": { title: "Milestones · 30 days" },
  "top-risks": { title: "Top risks" },
  "changed-since": { title: "Since you last looked" },
  "focus-task": { title: "Focus task" },
  "queue-buckets": { title: "Queue buckets" },
  "my-boards": { title: "My boards" },
  "done-this-week": { title: "Done this week" },
  "pm-hero": { title: "Check-in status hero" },
  "project-cards": { title: "Project cards" },
  "action-queue": { title: "Action queue" },
  "team-load": { title: "Team load" },
} as const;

export type WidgetKey = keyof typeof WIDGETS;

/** §2 wireframe order: hero|health-trend → KPIs → decision queue → heatmap|milestones+risks. */
export const EXECUTIVE_PRESET: WidgetKey[] = [
  "exec-hero",
  "health-trend",
  "exec-kpis",
  "decision-queue",
  "portfolio-heatmap",
  "milestones-30d",
  "top-risks",
  "changed-since",
];

/** §4 order: one decision made for you, then the queue, then context. */
export const DEVELOPER_PRESET: WidgetKey[] = ["focus-task", "queue-buckets", "my-boards", "done-this-week"];

/** §3 order: this week's ritual first, projects, then what's stuck on you. */
export const PM_PRESET: WidgetKey[] = ["pm-hero", "project-cards", "action-queue", "team-load"];

/** Personas with a dedicated preset today. Everyone else gets the interim v2 sections. */
export const BUILT_PRESETS: Partial<Record<UserGroup, WidgetKey[]>> = {
  executive: EXECUTIVE_PRESET,
  developer: DEVELOPER_PRESET,
  pm: PM_PRESET,
};

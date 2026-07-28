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

/** Personas with a dedicated preset today. Everyone else gets the interim v2 sections. */
export const BUILT_PRESETS: Partial<Record<UserGroup, WidgetKey[]>> = {
  executive: EXECUTIVE_PRESET,
};

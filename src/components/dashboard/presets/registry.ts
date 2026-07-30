import type { UserGroup } from "@/lib/personas";

/**
 * Widget registry + presets (docs/17 §0). A preset is an ORDERED list of widget keys;
 * widgets shared between presets are the same component reading the same engines —
 * no per-role math forks. All five personas have dedicated presets since M1c (§8
 * complete); the interim "v2" layout is retired.
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
  "qa-hero": { title: "Test-readiness hero" },
  "test-queue": { title: "Test queue" },
  "bugs-raised": { title: "Bugs I raised" },
  "project-quality": { title: "Project quality" },
  "golive-hero": { title: "Next go-live" },
  "open-gates": { title: "Open gate items" },
  "pilot-projects": { title: "Pilot & UAT projects" },
  "rollout-issues": { title: "Rollout issues" },
  "golive-calendar": { title: "Go-live calendar" },
  "handover-docs": { title: "Handover docs" },
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

/** §5 order: readiness sentence, triage + queue, my bugs, quality, my projects. */
export const QA_PRESET: WidgetKey[] = ["qa-hero", "test-queue", "bugs-raised", "project-quality", "portfolio-sections"];

/** §7 order: what goes live next, is it ready, what's in the way, when, my projects. */
export const IMPLEMENTOR_PRESET: WidgetKey[] = [
  "golive-hero",
  "open-gates",
  "pilot-projects",
  "rollout-issues",
  "golive-calendar",
  "handover-docs",
  "portfolio-sections",
];

/** Every persona has a dedicated preset since M1c (docs/17 §8 complete). */
export const BUILT_PRESETS: Record<UserGroup, WidgetKey[]> = {
  executive: EXECUTIVE_PRESET,
  developer: DEVELOPER_PRESET,
  pm: PM_PRESET,
  qa: QA_PRESET,
  implementor: IMPLEMENTOR_PRESET,
};

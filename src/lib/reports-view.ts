// Milestone B — who sees which /reports view, which tabs it has, and how the three URL
// params (week · as · tab) compose. Pure and client-safe; mirrors src/lib/dashboard-level.ts.

export type ReportsView = "pm" | "head" | "exec";

export const VIEW_LABEL: Record<ReportsView, string> = { pm: "PM", head: "Head of PMs", exec: "Executive" };
const VIEWS: ReportsView[] = ["pm", "head", "exec"];

/** The view a person's roles earn them. Head beats Executive (a Head approves). */
export function ownView(roles: string[]): ReportsView {
  if (roles.some((r) => r === "HeadOfProjects" || r === "PlatformSuperAdmin")) return "head";
  if (roles.some((r) => r === "Executive" || r === "HeadOfQA")) return "exec";
  return "pm";
}

/** Heads (and the super-admin) may preview the other views, read-only. */
export function canPreview(roles: string[]): boolean {
  return roles.some((r) => r === "HeadOfProjects" || r === "PlatformSuperAdmin");
}

export function resolveReportsView(roles: string[], requested?: string | null): ReportsView {
  if (requested && canPreview(roles) && (VIEWS as string[]).includes(requested)) return requested as ReportsView;
  return ownView(roles);
}

export const TABS: Record<ReportsView, { key: string; label: string }[]> = {
  pm: [
    { key: "week", label: "This week" },
    { key: "history", label: "History" },
    { key: "custom", label: "Custom reports" },
  ],
  head: [
    { key: "week", label: "This week" },
    { key: "rollups", label: "Past roll-ups" },
    { key: "custom", label: "Custom reports" },
  ],
  exec: [
    { key: "week", label: "This week" },
    { key: "past", label: "Past weeks" },
    { key: "custom", label: "Custom reports" },
  ],
};

/** Old six-tab keys keep landing: custom stays custom, the old Roll-ups tab becomes the
 * view's archive, everything else (mine/team/checkins/focus) is This week now. */
export function resolveTab(view: ReportsView, requested?: string | null): string {
  if (requested && TABS[view].some((t) => t.key === requested)) return requested;
  if (requested === "custom") return "custom";
  if (requested === "rollups") return view === "head" ? "rollups" : view === "exec" ? "past" : "week";
  return "week";
}

/** `/reports?…` with only the non-default params, so `/reports` stays the canonical URL. */
export function reportsHref(
  params: { week?: string | null; as?: string | null; tab?: string | null },
  defaults: { week: string; view: ReportsView },
): string {
  const q = new URLSearchParams();
  if (params.week && params.week !== defaults.week) q.set("week", params.week);
  if (params.as && params.as !== defaults.view) q.set("as", params.as);
  if (params.tab && params.tab !== "week") q.set("tab", params.tab);
  const s = q.toString();
  return s ? `/reports?${s}` : "/reports";
}

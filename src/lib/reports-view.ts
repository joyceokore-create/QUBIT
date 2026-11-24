// Milestone B — who sees which /reports view, which tabs it has, and how the three URL
// params (week · as · tab) compose. Pure and client-safe; mirrors src/lib/dashboard-level.ts.

import { can } from "@/lib/rbac";
import type { TenantContext } from "@/lib/tenant";

export type ReportsView = "pm" | "head" | "exec";

export const VIEW_LABEL: Record<ReportsView, string> = { pm: "PM", head: "Head", exec: "Executive" };
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
    { key: "week", label: "This Week" },
    { key: "history", label: "History" },
    { key: "custom", label: "Custom Reports" },
  ],
  head: [
    { key: "week", label: "This Week" },
    { key: "rollups", label: "Past Roll-Ups" },
    { key: "custom", label: "Custom Reports" },
  ],
  exec: [
    { key: "week", label: "This Week" },
    { key: "past", label: "Past Weeks" },
    { key: "custom", label: "Custom Reports" },
  ],
};

/** UX9 (UX plan D13) — Reports › Quality: Head of QA's extra tab in the Executive view. */
export const QUALITY_TAB = { key: "quality", label: "Quality" } as const;

/**
 * The tabs a view offers. Every view is TABS[view], except that a Head of QA reading the
 * Executive view also gets Quality (This week · Past weeks · Quality · Custom reports).
 */
export function tabsFor(view: ReportsView, opts: { quality: boolean } = { quality: false }): { key: string; label: string }[] {
  if (view !== "exec" || !opts.quality) return TABS[view];
  const [week, past, ...rest] = TABS.exec;
  return [week!, past!, { ...QUALITY_TAB }, ...rest];
}

/** Old six-tab keys keep landing: custom stays custom, the old Roll-ups tab becomes the
 * view's archive, everything else (mine/team/checkins/focus) is This week now. "quality" is
 * accepted only where the tab is offered; anyone else asking for it gets This week. */
export function resolveTab(view: ReportsView, requested?: string | null, opts: { quality: boolean } = { quality: false }): string {
  if (requested && tabsFor(view, opts).some((t) => t.key === requested)) return requested;
  if (requested === "custom") return "custom";
  if (requested === "rollups") return view === "head" ? "rollups" : view === "exec" ? "past" : "week";
  return "week";
}

/**
 * Who may read the Quality report (the tab and its CSV): someone who holds Head of QA and
 * reports:read. Decided on REAL roles and permissions — "Viewing as" never widens it, and a
 * Super Admin previewing Head of QA (a role they don't hold) doesn't get it.
 */
export function canReadQualityReport(ctx: TenantContext): boolean {
  return ctx.roles.includes("HeadOfQA") && can(ctx, "reports:read");
}

/**
 * Whether /reports offers the Quality tab: the person may read it AND is reading as Head of
 * QA — the classic layout (one view per person), or the new layout "Viewing as" Head of QA.
 * A Head of QA who also holds Executive and is viewing as Executive sees the Executive tabs.
 */
export function showsQualityTab(ctx: TenantContext, layout: { uiMode: string; viewRole: string }): boolean {
  if (!canReadQualityReport(ctx)) return false;
  return layout.uiMode !== "new" || layout.viewRole === "HeadOfQA";
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

/**
 * UX6 (UX plan D13) — a viewer without reports:read (a Member, by default) gets a Reports
 * page with Custom reports only, offering just the "My …" datasets; the weekly views
 * (This week, History, roll-ups) are never loaded for them. Decided on REAL permissions,
 * so a tenant that grants a Member reports:read gives them the full PM view.
 */
export function customReportsOnly(ctx: TenantContext): boolean {
  return !can(ctx, "reports:read");
}

export const CUSTOM_ONLY_TABS: { key: string; label: string }[] = [{ key: "custom", label: "Custom Reports" }];

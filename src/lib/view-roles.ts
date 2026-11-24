import { z } from "zod";
import type { DashboardLevel } from "@/lib/dashboard-level";
import type { ReportsView } from "@/lib/reports-view";

/**
 * "Viewing as" (UX plan D2a). A person with more than one role picks which role's home
 * page and menu they see. Presentation only: it NEVER changes permissions, routing or
 * search. Pure and client-safe.
 *
 * Order (replaces resolveLevel's, which ranked the Heads above Executive):
 *   Executive → Head → Head of QA → Project Manager → Member.
 * Super Admin sits outside the order: a Super Admin with no business role lands on Admin;
 * with one, lands on that role's home. Super Admin's switch is "Preview home as…" over all
 * five roles, shown with their own data — not impersonation.
 */
export const BUSINESS_ROLES = ["Executive", "HeadOfProjects", "HeadOfQA", "ProjectManager", "Member"] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];
export const SUPER_ADMIN = "PlatformSuperAdmin" as const;
export type ViewRole = BusinessRole | typeof SUPER_ADMIN;

export const VIEW_ROLE_LABEL: Record<ViewRole, string> = {
  PlatformSuperAdmin: "Super Admin",
  Executive: "Executive",
  HeadOfProjects: "Head",
  HeadOfQA: "Head of QA",
  ProjectManager: "Project Manager",
  Member: "Member",
};

/** What each view role lands on (the home pages arrive in UX4–UX11). */
export const VIEW_ROLE_HOME: Record<ViewRole, string> = {
  PlatformSuperAdmin: "Admin Home",
  Executive: "Portfolio Home",
  HeadOfProjects: "Delivery Health",
  HeadOfQA: "Quality Home",
  ProjectManager: "Today",
  Member: "My Work",
};

const isBusiness = (r: string): r is BusinessRole => (BUSINESS_ROLES as readonly string[]).includes(r);
const CANONICAL = new Set<string>([...BUSINESS_ROLES, SUPER_ADMIN]);

/**
 * The business roles a person holds, in the D2a order. A custom (non-canonical) role gets
 * the Member layout (Q4); someone with no business role and no Super Admin is a Member.
 */
export function heldBusinessRoles(roles: readonly string[]): BusinessRole[] {
  const held = new Set<BusinessRole>(roles.filter(isBusiness));
  if (roles.some((r) => !CANONICAL.has(r))) held.add("Member");
  if (held.size === 0 && !roles.includes(SUPER_ADMIN)) held.add("Member");
  return BUSINESS_ROLES.filter((r) => held.has(r));
}

/** The roles offered in the switch: Super Admin previews every role; others pick among their own. */
export function viewRoleOptions(roles: readonly string[]): ViewRole[] {
  if (roles.includes(SUPER_ADMIN)) return [SUPER_ADMIN, ...BUSINESS_ROLES];
  return heldBusinessRoles(roles);
}

/** The switch shows only to Super Admin ("Preview home as…") and people with 2+ roles. */
export function showViewSwitch(roles: readonly string[]): boolean {
  return roles.includes(SUPER_ADMIN) || heldBusinessRoles(roles).length > 1;
}

/** Where a person lands: their last valid choice, else their highest business role, else Admin. */
export function landingViewRole(roles: readonly string[], last?: string | null): ViewRole {
  const options = viewRoleOptions(roles);
  if (last && (options as string[]).includes(last)) return last as ViewRole;
  return heldBusinessRoles(roles)[0] ?? SUPER_ADMIN;
}

/** True when a Super Admin is previewing a role they don't hold (shown with their own data). */
export function isPreviewing(roles: readonly string[], viewRole: ViewRole): boolean {
  return viewRole !== SUPER_ADMIN && !heldBusinessRoles(roles).includes(viewRole);
}

/** Until each role's new home ships, "Viewing as" opens the existing cockpit at this level. */
export const VIEW_ROLE_LEVEL: Record<ViewRole, DashboardLevel> = {
  PlatformSuperAdmin: "superadmin",
  Executive: "exec",
  HeadOfProjects: "head",
  HeadOfQA: "head",
  ProjectManager: "pm",
  Member: "user",
};

/** The /reports view each role reads (Head of QA reads the Executive views, as today). */
export const VIEW_ROLE_REPORTS: Record<ViewRole, ReportsView> = {
  PlatformSuperAdmin: "head",
  Executive: "exec",
  HeadOfProjects: "head",
  HeadOfQA: "exec",
  ProjectManager: "pm",
  Member: "pm",
};

export const ViewRoleInput = z.object({ role: z.enum([SUPER_ADMIN, ...BUSINESS_ROLES]) });

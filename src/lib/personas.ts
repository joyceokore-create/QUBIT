import type { ProjectRoleCategory } from "@/lib/roles";

/**
 * User groups / dashboard personas (docs/17 §1). A persona decides WHICH preset the
 * dashboard composes — presentation only, NEVER permission (RBAC is untouched by
 * anything in this file). Effective groups = DECLARED (set at invite) ∪ DERIVED (from
 * live memberships and tenant roles), resolved at login and baked into the session —
 * the same lifecycle as permissions (DM1.7).
 */

export const USER_GROUPS = ["executive", "pm", "developer", "qa", "implementor"] as const;
export type UserGroup = (typeof USER_GROUPS)[number];

/** Landing priority when no primary/last choice applies (docs/17 §1.1). */
const LANDING_PRIORITY: UserGroup[] = ["executive", "pm", "implementor", "qa", "developer"];

/** Tenant roles that imply the executive persona. NOTE: PlatformSuperAdmin is NOT here.
 * A super admin is not an executive wearing a different hat — they hold every access in
 * the tenant, so they get EVERY persona (see derivedGroups) and the shell labels them as
 * a super admin rather than pretending they are one of the five. */
const EXECUTIVE_ROLES = ["Executive", "HeadOfProjects", "HeadOfQA"];

/** The all-access role. Presentation only — RBAC already treats "*" as every permission. */
export const SUPERADMIN_ROLE = "PlatformSuperAdmin";

/** True when the viewer holds the tenant's all-access role. */
export function isSuperAdmin(tenantRoles: readonly string[]): boolean {
  return tenantRoles.includes(SUPERADMIN_ROLE);
}

const CATEGORY_GROUP: Record<ProjectRoleCategory, UserGroup | null> = {
  PM: "pm",
  Dev: "developer",
  QA: "qa",
  Implementor: "implementor", // docs/17 §7 — fifth category, joined in M1c
  // Stakeholders get no group of their own — their landing persona comes from
  // declared groups or tenant roles; a pure stakeholder falls back per landingPersona().
  Stakeholder: null,
};

export function isUserGroup(value: unknown): value is UserGroup {
  return typeof value === "string" && (USER_GROUPS as readonly string[]).includes(value);
}

export interface DerivedInputs {
  /** projectRoleCategory() of each of the user's project memberships. */
  membershipCategories: ProjectRoleCategory[];
  /** Tenant RBAC roles. */
  tenantRoles: string[];
  /** Leads at least one project. */
  leadsProjects: boolean;
}

/** The DERIVED half of §1.1 — authoritative once memberships exist. */
export function derivedGroups({ membershipCategories, tenantRoles, leadsProjects }: DerivedInputs): UserGroup[] {
  const groups = new Set<UserGroup>();
  for (const category of membershipCategories) {
    const g = CATEGORY_GROUP[category];
    if (g) groups.add(g);
  }
  if (tenantRoles.some((r) => EXECUTIVE_ROLES.includes(r))) groups.add("executive");
  if (leadsProjects) groups.add("pm");
  // A super admin sees every view — they are not assigned a persona, they can wear all
  // of them. Landing still follows LANDING_PRIORITY (executive first).
  if (isSuperAdmin(tenantRoles)) for (const g of USER_GROUPS) groups.add(g);
  return [...groups];
}

/** Effective groups = declared ∪ derived; unknown declared values are dropped, never stored. */
export function effectiveGroups(declared: string[], derived: UserGroup[]): UserGroup[] {
  const groups = new Set<UserGroup>(derived);
  for (const d of declared) if (isUserGroup(d)) groups.add(d);
  return LANDING_PRIORITY.filter((g) => groups.has(g)); // stable, priority-ordered
}

/**
 * Which preset the user lands on: last-used switcher choice wins, then the declared
 * primary, then the fixed priority. Falls back to "developer" for a user with no groups
 * at all (a pure stakeholder still gets a personal, task-first view — never a blank).
 */
export function landingPersona(
  effective: UserGroup[],
  primaryGroup?: string | null,
  lastPersona?: string | null,
): UserGroup {
  if (isUserGroup(lastPersona) && effective.includes(lastPersona)) return lastPersona;
  if (isUserGroup(primaryGroup) && effective.includes(primaryGroup)) return primaryGroup;
  return effective[0] ?? "developer";
}

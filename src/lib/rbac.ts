// Role → permission mapping (docs/07-auth-rbac.md). Permissions are "resource:action"
// strings; "*" matches any resource or action, so "project:*" and "*:read" are valid grants.
import type { TenantContext } from "@/lib/tenant";

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SystemAdmin: ["*:*", "iam:manage"],
  PortfolioManager: ["dashboard:read", "portfolio:*", "project:read", "risk:read", "reports:read"],
  // dashboard:read added to these three (Milestone 4) — /dashboard is every user's
  // post-login landing page, and without it they hit a Forbidden wall immediately after
  // signing in. DepartmentHead is left as-is: a dynamic, approval-only role, not a
  // day-to-day user who needs a dashboard landing page.
  ProjectManager: ["dashboard:read", "project:*", "risk:*", "issue:*", "task:*"],
  FinanceManager: ["dashboard:read", "finance:*"],
  Contributor: ["dashboard:read", "task:*", "risk:create", "issue:create", "timesheet:submit"],
  Viewer: ["*:read"],
  DepartmentHead: ["approvals:decide"],
  // Cross-tenant admin — read-only oversight everywhere, no business-data authoring
  // (no create/update/delete on projects, risks, budgets, etc.) and no iam:manage outside
  // its own tenant. Broadened from tenant:switch-only since a role with zero visibility
  // into the product can't meaningfully oversee anything.
  PlatformSuperAdmin: ["*:read", "tenant:switch"],
};

/** The fixed, browsable permission catalogue (FR-IAM-04). Extend as new modules land. */
export const PERMISSION_CATALOGUE = [
  "dashboard:read",
  "portfolio:read",
  "portfolio:create",
  "portfolio:update",
  "project:read",
  "project:create",
  "project:update",
  "risk:read",
  "risk:create",
  "risk:update",
  "issue:read",
  "issue:create",
  "issue:update",
  "task:read",
  "task:create",
  "task:update",
  "timesheet:submit",
  "timesheet:read_all",
  "reports:read",
  "finance:read",
  "approvals:decide",
  "iam:manage",
  "tenant:switch",
] as const;

export interface Scope {
  type: "portfolio" | "orgUnit";
  id: string;
}

function matchesPermission(granted: string, requested: string): boolean {
  if (granted === requested) return true;
  const [grantedResource, grantedAction] = granted.split(":");
  const [requestedResource, requestedAction] = requested.split(":");
  const resourceMatches = grantedResource === "*" || grantedResource === requestedResource;
  const actionMatches = grantedAction === "*" || grantedAction === requestedAction;
  return resourceMatches && actionMatches;
}

/**
 * Resolves whether the current session's roles grant `permission`. Roles come from the
 * session (see TenantContext), never from the client. `scope` is accepted for forward
 * compatibility with scoped role assignments (portfolio/orgUnit) — Phase A role
 * assignments are tenant-wide, so it isn't enforced differently yet; wire it up once
 * scoped grants are surfaced in the IAM UI (Phase C).
 */
export function can(ctx: TenantContext, permission: string, _scope?: Scope): boolean {
  return ctx.roles.some((role) => {
    const grants = ROLE_PERMISSIONS[role];
    if (!grants) return false;
    return grants.some((granted) => matchesPermission(granted, permission));
  });
}

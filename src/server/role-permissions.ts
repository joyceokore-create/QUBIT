import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { CANONICAL_ROLES, PERMISSION_CATALOGUE, ROLE_PERMISSIONS } from "@/lib/rbac";

/**
 * Tenant-editable role → permission sets (Phase 1.5, DECISIONS DM1.7).
 *
 * A role's effective permissions are the CODE default (rbac.ts ROLE_PERMISSIONS) unless the
 * tenant has RolePermission rows for that role, in which case those rows fully define the set
 * (replace semantics). PlatformSuperAdmin is LOCKED to full access ("*") and can never be
 * edited — a guard against an admin removing their own access. Effective permissions are
 * resolved at login and baked into the session (see src/lib/auth.ts), so `can()` stays sync;
 * a change therefore takes effect on each affected user's NEXT sign-in.
 */

const LOCKED_ROLES = ["PlatformSuperAdmin"];

/** Canonical roles whose permission sets an admin may edit (everything except the locked ones). */
export const EDITABLE_ROLES = CANONICAL_ROLES.filter((r) => !LOCKED_ROLES.includes(r));

function isCanonicalRole(role: string): boolean {
  return (CANONICAL_ROLES as readonly string[]).includes(role);
}

/** Effective permissions for one role, given the tenant's override map. */
function effectiveForRole(role: string, overrides: Map<string, string[]>): string[] {
  if (LOCKED_ROLES.includes(role)) return ROLE_PERMISSIONS[role] ?? ["*"];
  const custom = overrides.get(role);
  if (custom && custom.length) return custom;
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Load the tenant's role → permission[] overrides within an existing (RLS-scoped) tx. */
async function loadOverrides(tx: Prisma.TransactionClient, tenantId: string): Promise<Map<string, string[]>> {
  const rows = await tx.rolePermission.findMany({
    where: { tenantId },
    select: { role: true, permission: true },
  });
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.role) ?? map.set(r.role, []).get(r.role)!;
    list.push(r.permission);
  }
  return map;
}

/**
 * Union of effective permissions across a set of roles — baked into the session at login.
 * Runs inside a caller-supplied tx so it shares the login transaction's RLS scope.
 */
export async function resolvePermissionsForRoles(
  tx: Prisma.TransactionClient,
  tenantId: string,
  roles: string[],
): Promise<string[]> {
  const overrides = await loadOverrides(tx, tenantId);
  const set = new Set<string>();
  for (const role of roles) for (const p of effectiveForRole(role, overrides)) set.add(p);
  return [...set];
}

export interface RolePermissionView {
  role: string;
  permissions: string[];
  customised: boolean; // the tenant has overridden the code default for this role
  editable: boolean; // false for PlatformSuperAdmin (locked)
}

/** Effective permission set for every canonical role — powers the Admin → Roles editor. */
export async function listRolePermissions(ctx: TenantContext): Promise<RolePermissionView[]> {
  return withTenant(ctx, async (tx) => {
    const overrides = await loadOverrides(tx, ctx.tenantId);
    return CANONICAL_ROLES.map((role) => ({
      role,
      permissions: effectiveForRole(role, overrides),
      customised: overrides.has(role),
      editable: !LOCKED_ROLES.includes(role),
    }));
  });
}

export class RolePermissionError extends Error {
  constructor(
    message: string,
    public code: "LOCKED" | "BAD_ROLE" | "BAD_PERMISSION",
  ) {
    super(message);
    this.name = "RolePermissionError";
  }
}

/**
 * Replace a role's permission set for this tenant (full set — replace semantics). Passing the
 * exact code default, or an empty set, clears the override so the role reverts to its default.
 * PlatformSuperAdmin cannot be edited. Audited. Applies on each affected user's next login.
 */
export async function setRolePermissions(
  ctx: TenantContext,
  role: string,
  permissions: string[],
): Promise<void> {
  if (LOCKED_ROLES.includes(role)) {
    throw new RolePermissionError("PlatformSuperAdmin permissions can't be changed.", "LOCKED");
  }
  if (!isCanonicalRole(role)) throw new RolePermissionError("Unknown role.", "BAD_ROLE");

  const requested = [...new Set(permissions)];
  const allowed = new Set<string>(PERMISSION_CATALOGUE);
  const cleaned = requested.filter((p) => allowed.has(p));
  if (cleaned.length !== requested.length) {
    throw new RolePermissionError("One or more permissions are not in the catalogue.", "BAD_PERMISSION");
  }

  await withTenant(ctx, async (tx) => {
    const before = (
      await tx.rolePermission.findMany({ where: { tenantId: ctx.tenantId, role }, select: { permission: true } })
    ).map((r) => r.permission);

    await tx.rolePermission.deleteMany({ where: { tenantId: ctx.tenantId, role } });

    // Empty set OR exactly the code default → leave cleared (role uses the code default).
    const def = ROLE_PERMISSIONS[role] ?? [];
    const isDefault = cleaned.length === def.length && cleaned.every((p) => def.includes(p));
    if (cleaned.length > 0 && !isDefault) {
      await tx.rolePermission.createMany({
        data: cleaned.map((permission) => ({ tenantId: ctx.tenantId, role, permission })),
      });
    }

    await audit(tx, ctx, {
      action: "update",
      entityType: "role_permission",
      entityId: role,
      before: { permissions: before },
      after: { permissions: cleaned },
    });
  });
}

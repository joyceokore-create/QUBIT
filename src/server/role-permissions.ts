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

/**
 * Custom roles (tuma-style permission bundles). A custom role is a CustomRole row plus
 * RolePermission rows keyed by its name — the resolver below treats those rows exactly
 * like a canonical override, so custom roles need no engine of their own. Deactivated
 * custom roles resolve to ZERO permissions (fail-closed) while keeping their rows and
 * assignments, so reactivation restores everything.
 */

function loadCustomRoles(tx: Prisma.TransactionClient, tenantId: string) {
  return tx.customRole.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * The set of grantable permission codes. Prefer ACTIVE rows in the global `permission`
 * catalogue (the DB source of truth after syncCatalogue); fall back to the in-code
 * PERMISSION_CATALOGUE if the table is empty (e.g. a DB migrated but not yet synced).
 * Global table — read with the plain client, no tenant scope.
 */
async function grantablePermissions(tx: Prisma.TransactionClient): Promise<Set<string>> {
  const rows = await tx.permission.findMany({ where: { status: "Active" }, select: { code: true } });
  if (rows.length === 0) return new Set<string>(PERMISSION_CATALOGUE);
  return new Set(rows.map((r) => r.code));
}

/** Route/page-friendly wrapper: assignable role names under the caller's tenant context. */
export async function listAssignableRoles(ctx: TenantContext): Promise<string[]> {
  return withTenant(ctx, (tx) => assignableRoleNames(tx, ctx.tenantId));
}

/** Role names a user may currently be assigned: canonical + ACTIVE custom roles. */
export async function assignableRoleNames(tx: Prisma.TransactionClient, tenantId: string): Promise<string[]> {
  const custom = await tx.customRole.findMany({
    where: { tenantId, status: "Active" },
    select: { name: true },
  });
  return [...CANONICAL_ROLES, ...custom.map((c) => c.name)];
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
  // A deactivated custom role contributes nothing — fail closed, even though its
  // RolePermission rows and assignments are kept for reactivation.
  const deactivated = new Set(
    (
      await tx.customRole.findMany({
        where: { tenantId, status: { not: "Active" } },
        select: { name: true },
      })
    ).map((c) => c.name),
  );
  const set = new Set<string>();
  for (const role of roles) {
    if (deactivated.has(role)) continue;
    for (const p of effectiveForRole(role, overrides)) set.add(p);
  }
  return [...set];
}

export interface RolePermissionView {
  role: string;
  permissions: string[];
  customised: boolean; // the tenant has overridden the code default for this role
  editable: boolean; // false for PlatformSuperAdmin (locked)
  /** Set only for admin-created custom roles. */
  custom?: {
    id: string;
    status: string;
    description: string | null;
    deactivationReason: string | null;
    assignedCount: number;
  };
}

/** Effective permission set for every role (canonical six + the tenant's custom roles). */
export async function listRolePermissions(ctx: TenantContext): Promise<RolePermissionView[]> {
  return withTenant(ctx, async (tx) => {
    const overrides = await loadOverrides(tx, ctx.tenantId);
    const canonical: RolePermissionView[] = CANONICAL_ROLES.map((role) => ({
      role,
      permissions: effectiveForRole(role, overrides),
      customised: overrides.has(role),
      editable: !LOCKED_ROLES.includes(role),
    }));

    const customRoles = await loadCustomRoles(tx, ctx.tenantId);
    if (customRoles.length === 0) return canonical;

    const counts = await tx.roleAssignment.groupBy({
      by: ["role"],
      where: { tenantId: ctx.tenantId, role: { in: customRoles.map((c) => c.name) } },
      _count: { _all: true },
    });
    const countByRole = new Map(counts.map((c) => [c.role, c._count._all]));

    const custom: RolePermissionView[] = customRoles.map((c) => ({
      role: c.name,
      permissions: c.status === "Active" ? (overrides.get(c.name) ?? []) : [],
      customised: true,
      editable: c.status === "Active",
      custom: {
        id: c.id,
        status: c.status,
        description: c.description,
        deactivationReason: c.deactivationReason,
        assignedCount: countByRole.get(c.name) ?? 0,
      },
    }));
    return [...canonical, ...custom];
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

  const requested = [...new Set(permissions)];

  await withTenant(ctx, async (tx) => {
    const allowed = await grantablePermissions(tx);
    const cleaned = requested.filter((p) => allowed.has(p));
    if (cleaned.length !== requested.length) {
      throw new RolePermissionError("One or more permissions are not in the catalogue.", "BAD_PERMISSION");
    }

    const custom = isCanonicalRole(role)
      ? null
      : await tx.customRole.findUnique({ where: { tenantId_name: { tenantId: ctx.tenantId, name: role } } });
    if (!isCanonicalRole(role)) {
      if (!custom) throw new RolePermissionError("Unknown role.", "BAD_ROLE");
      if (custom.status !== "Active") {
        throw new RolePermissionError("This role is deactivated — reactivate it before editing.", "LOCKED");
      }
    }

    const before = (
      await tx.rolePermission.findMany({ where: { tenantId: ctx.tenantId, role }, select: { permission: true } })
    ).map((r) => r.permission);

    await tx.rolePermission.deleteMany({ where: { tenantId: ctx.tenantId, role } });

    // Canonical: empty set OR exactly the code default → leave cleared (role uses the code
    // default). Custom roles have no code default — whatever is saved IS the set.
    const def = custom ? [] : (ROLE_PERMISSIONS[role] ?? []);
    const isDefault = !custom && cleaned.length === def.length && cleaned.every((p) => def.includes(p));
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

const CUSTOM_NAME_MAX = 64;

function validateCustomRoleName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > CUSTOM_NAME_MAX) {
    throw new RolePermissionError("Role name must be 2–64 characters.", "BAD_ROLE");
  }
  if ((CANONICAL_ROLES as readonly string[]).some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
    throw new RolePermissionError("That name is a built-in role.", "BAD_ROLE");
  }
  return trimmed;
}

/** Create a custom role with its initial permission set. Audited. */
export async function createCustomRole(
  ctx: TenantContext,
  input: { name: string; description?: string | null; permissions: string[] },
): Promise<string> {
  const name = validateCustomRoleName(input.name);
  const requested = [...new Set(input.permissions)];

  return withTenant(ctx, async (tx) => {
    const allowed = await grantablePermissions(tx);
    if (requested.some((p) => !allowed.has(p))) {
      throw new RolePermissionError("One or more permissions are not in the catalogue.", "BAD_PERMISSION");
    }

    const clash = await tx.customRole.findFirst({
      where: { tenantId: ctx.tenantId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (clash) throw new RolePermissionError("A role with that name already exists.", "BAD_ROLE");

    const created = await tx.customRole.create({
      data: {
        tenantId: ctx.tenantId,
        name,
        description: input.description?.trim() || null,
        createdById: ctx.userId,
      },
    });
    if (requested.length > 0) {
      await tx.rolePermission.createMany({
        data: requested.map((permission) => ({ tenantId: ctx.tenantId, role: name, permission })),
      });
    }
    await audit(tx, ctx, {
      action: "create",
      entityType: "custom_role",
      entityId: created.id,
      after: { name, description: created.description, permissions: requested },
    });
    return created.id;
  });
}

/**
 * Rename / re-describe a custom role. A rename cascades to its RolePermission rows and every
 * RoleAssignment in the same transaction — assignments reference roles by name.
 */
export async function updateCustomRole(
  ctx: TenantContext,
  id: string,
  input: { name?: string; description?: string | null },
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const existing = await tx.customRole.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== ctx.tenantId) {
      throw new RolePermissionError("Unknown role.", "BAD_ROLE");
    }

    const nextName = input.name !== undefined ? validateCustomRoleName(input.name) : existing.name;
    if (nextName !== existing.name) {
      const clash = await tx.customRole.findFirst({
        where: { tenantId: ctx.tenantId, name: { equals: nextName, mode: "insensitive" }, NOT: { id } },
        select: { id: true },
      });
      if (clash) throw new RolePermissionError("A role with that name already exists.", "BAD_ROLE");
    }

    const nextDescription =
      input.description !== undefined ? input.description?.trim() || null : existing.description;

    await tx.customRole.update({ where: { id }, data: { name: nextName, description: nextDescription } });
    if (nextName !== existing.name) {
      await tx.rolePermission.updateMany({
        where: { tenantId: ctx.tenantId, role: existing.name },
        data: { role: nextName },
      });
      await tx.roleAssignment.updateMany({
        where: { tenantId: ctx.tenantId, role: existing.name },
        data: { role: nextName },
      });
    }
    await audit(tx, ctx, {
      action: "update",
      entityType: "custom_role",
      entityId: id,
      before: { name: existing.name, description: existing.description },
      after: { name: nextName, description: nextDescription },
    });
  });
}

/**
 * Deactivate (reason required) or reactivate a custom role. Rows and assignments are kept;
 * a deactivated role simply resolves to zero permissions on each holder's next sign-in.
 */
export async function setCustomRoleStatus(
  ctx: TenantContext,
  id: string,
  status: "Active" | "Deactivated",
  reason?: string,
): Promise<void> {
  if (status === "Deactivated" && !reason?.trim()) {
    throw new RolePermissionError("A deactivation reason is required.", "BAD_ROLE");
  }
  await withTenant(ctx, async (tx) => {
    const existing = await tx.customRole.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== ctx.tenantId) {
      throw new RolePermissionError("Unknown role.", "BAD_ROLE");
    }
    if (existing.status === status) return;
    await tx.customRole.update({
      where: { id },
      data: { status, deactivationReason: status === "Deactivated" ? reason!.trim() : null },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "custom_role",
      entityId: id,
      before: { status: existing.status, deactivationReason: existing.deactivationReason },
      after: { status, deactivationReason: status === "Deactivated" ? reason!.trim() : null },
    });
  });
}

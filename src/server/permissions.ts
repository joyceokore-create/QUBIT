import type { Prisma } from "@prisma/client";
import { can } from "@/lib/rbac";
import type { TenantContext } from "@/lib/tenant";
import { resolveLocation } from "@/server/hierarchy";

/**
 * Object-level permissions for the transformation (docs/clickup-transformation,
 * 04 §16). Extends the PPM role-based `can()` with hierarchy **levels** and
 * ancestor resolution (a list inherits its space's access).
 *
 * Phase 0 scaffold: levels + the resolution *surface* are here and used by
 * handlers now; the full per-object `PermissionOverride` matrix (and Space
 * membership for private spaces) lands with that model in a later phase. Until
 * then, level derives from role defaults and a private-space visibility gate.
 */

export type PermLevel = "VIEW" | "COMMENT" | "EDIT" | "FULL";

const RANK: Record<PermLevel, number> = { VIEW: 1, COMMENT: 2, EDIT: 3, FULL: 4 };

/** True when `actual` meets or exceeds the `required` level. */
export function hasLevel(actual: PermLevel, required: PermLevel): boolean {
  return RANK[actual] >= RANK[required];
}

export { can };

/**
 * The caller's effective level on a location, or `null` if it's invisible to them
 * (missing, cross-tenant, or a private space they're not entitled to — all of which
 * a handler should surface as 404, never 403).
 */
export async function resolveLocationLevel(
  ctx: TenantContext,
  tx: Prisma.TransactionClient,
  type: Parameters<typeof resolveLocation>[1],
  id: string | null,
): Promise<PermLevel | null> {
  const loc = await resolveLocation(tx, type, id); // throws NotFound if cross-tenant/missing

  if (loc.spaceId) {
    const space = await tx.space.findUnique({
      where: { id: loc.spaceId },
      select: { isPrivate: true },
    });
    // Interim: private spaces are visible only to workspace admins until Space
    // membership + PermissionOverride land. Non-admins get no level (→ 404).
    if (space?.isPrivate && !can(ctx, "iam:manage")) return null;
  }

  // Interim role→level default. Replaced by PermissionOverride resolution later.
  return can(ctx, "iam:manage") ? "FULL" : "EDIT";
}

/** Convenience gate: does the caller have at least `required` on the location? */
export async function canAccessLocation(
  ctx: TenantContext,
  tx: Prisma.TransactionClient,
  type: Parameters<typeof resolveLocation>[1],
  id: string | null,
  required: PermLevel = "VIEW",
): Promise<boolean> {
  const level = await resolveLocationLevel(ctx, tx, type, id);
  return level !== null && hasLevel(level, required);
}

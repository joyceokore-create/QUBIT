import type { Prisma } from "@prisma/client";
import { withTenant, getTenantContext, type TenantContext } from "@/lib/tenant";
import { NotFoundError } from "@/server/errors";

/**
 * Tenant-scoped data access for the transformation modules
 * (docs/clickup-transformation). Thin wrapper over the PPM `withTenant()` so all
 * new `src/server/*` code uses one name and one RLS-guarded transaction.
 *
 * HARD RULE (CLAUDE.md): never call bare `prisma.*` for tenant-owned data from a
 * route handler or component — always go through `forTenant()` so the RLS policies
 * in prisma/rls.sql scope every query to the caller's tenant.
 */
export function forTenant<T>(
  ctx: Pick<TenantContext, "tenantId" | "userId">,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenant(ctx, fn);
}

/** Resolve the current request's tenant context (throws if unauthenticated). */
export { getTenantContext };

/**
 * Guard for "fetch by id" reads: a null result under RLS means the row is either
 * missing or belongs to another tenant — both surface as 404 (no existence leak).
 */
export function assertFound<T>(value: T | null | undefined, message?: string): T {
  if (value === null || value === undefined) throw new NotFoundError(message);
  return value;
}

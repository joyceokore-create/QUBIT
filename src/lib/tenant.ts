import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface TenantContext {
  tenantId: string;
  userId: string;
  roles: string[];
  /**
   * Effective permissions resolved at login (code role defaults merged with any tenant
   * role-permission overrides — see src/server/role-permissions.ts). When present, `can()`
   * uses these directly; when absent it falls back to the code role → permission map. Optional
   * so tests and internal contexts can construct a ctx from roles alone.
   */
  permissions?: string[];
}

/**
 * Runs `fn` inside a transaction with `app.tenant_id` / `app.user_id` set for the
 * connection, so the RLS policies in prisma/rls.sql scope every query to the caller's
 * tenant. Never call a bare `prisma.*` for tenant-owned data — always go through this.
 * See docs/04-multitenancy.md.
 */
export async function withTenant<T>(
  ctx: Pick<TenantContext, "tenantId" | "userId">,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId}, true)`;
    return fn(tx);
  });
}

/**
 * Reads the Auth.js session (server-side) and returns the tenant context for the current
 * request. Route handlers and server actions call this first — never trust a
 * client-supplied tenantId/role. Throws if there is no session. See docs/04-multitenancy.md.
 */
export async function getTenantContext(): Promise<TenantContext> {
  // Imported lazily to avoid a module-init cycle: src/lib/auth.ts's Credentials
  // authorize() calls withTenant() from this file to look up the user during login.
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) {
    throw new Error("No active session.");
  }
  return {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles ?? [],
    permissions: session.user.permissions,
  };
}

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface TenantContext {
  tenantId: string;
  userId: string;
}

/**
 * Runs `fn` inside a transaction with `app.tenant_id` / `app.user_id` set for the
 * connection, so the RLS policies in prisma/rls.sql scope every query to the caller's
 * tenant. Never call a bare `prisma.*` for tenant-owned data — always go through this.
 * See docs/04-multitenancy.md.
 */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId}, true)`;
    return fn(tx);
  });
}

// getTenantContext() reads the Auth.js session and derives { tenantId, userId } for the
// current request. It lands in Milestone 2 alongside src/lib/auth.ts, once a session
// actually exists to read from — see docs/10-build-plan.md.

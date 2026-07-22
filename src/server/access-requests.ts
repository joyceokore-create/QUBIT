import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import type { AccessRequest } from "@prisma/client";

/** Thrown for expected admin-review failures (e.g. unknown id). Carries a stable `code`. */
export class AccessRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AccessRequestError";
    this.code = code;
  }
}

/** System read (no tenant scope): NEW first, then newest. */
export function listAccessRequests(): Promise<AccessRequest[]> {
  return prisma.accessRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

/** Count of pending (NEW) requests — feeds the admin-nav badge. */
export function countNewAccessRequests(): Promise<number> {
  return prisma.accessRequest.count({ where: { status: "NEW" } });
}

/**
 * Mark a request Reviewed/Dismissed. The access_request UPDATE is a system-table write, but
 * we run it inside withTenant(ctx) so the audit_log row is tenant-scoped to the reviewing
 * admin and atomic with the status change (docs/07-auth-rbac.md).
 */
export async function reviewAccessRequest(
  ctx: Pick<TenantContext, "tenantId" | "userId">,
  id: string,
  status: "REVIEWED" | "DISMISSED",
): Promise<AccessRequest> {
  const existing = await prisma.accessRequest.findUnique({ where: { id } });
  if (!existing) throw new AccessRequestError("NOT_FOUND", "Access request not found.");

  return withTenant(ctx, async (tx) => {
    const updated = await tx.accessRequest.update({
      where: { id },
      data: { status, reviewedById: ctx.userId, reviewedAt: new Date() },
    });
    await audit(tx, ctx, {
      action: "access_request_review",
      entityType: "access_request",
      entityId: id,
      before: { status: existing.status },
      after: { status },
    });
    return updated;
  });
}

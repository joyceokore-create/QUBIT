import type { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";

export type AuditAction = "create" | "update" | "delete" | "tenant_switch" | "mfa_enroll";

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Writes an audit_log row inside the same transaction as the mutation it records
 * (docs/07-auth-rbac.md). Always call this from within the withTenant() transaction whose
 * `tx` you pass in, so the row is tenant-scoped and atomic with the mutation.
 */
export async function audit(
  tx: Prisma.TransactionClient,
  ctx: Pick<TenantContext, "tenantId" | "userId">,
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? undefined : (entry.before as Prisma.InputJsonValue),
      after: entry.after === undefined ? undefined : (entry.after as Prisma.InputJsonValue),
    },
  });
}

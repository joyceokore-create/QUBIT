import type { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "tenant_switch"
  | "mfa_enroll"
  | "role_grant"
  | "role_revoke"
  | "access_request_review"
  | "view_switch" // UX3 (D2a): a "Viewing as" / "Preview home as…" change — presentation only
  | "mfa_reminder" // UX fidelity Tier 1: a bulk "set up MFA" reminder (one row per batch)
  // WS1 (Tier 4) gate sign-off: one row per transition, with before/after approval state.
  | "gate.submit"
  | "gate.approve"
  | "gate.approve_exception"
  | "gate.return"
  // WS2 (Tier 4) decisions waiting on the Group, and GLC actions.
  | "decision.raise"
  | "decision.decide"
  | "decision.defer"
  | "glc_action.create"
  | "glc_action.complete";

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

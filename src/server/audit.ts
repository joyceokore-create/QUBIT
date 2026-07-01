import { withTenant, type TenantContext } from "@/lib/tenant";

export interface AuditLogRow {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
}

/** Latest audit_log rows for the IAM audit viewer (FR-IAM-05/06). Resolves actor names
 * where the actorId is a real user (seed/system actors like "seed-script" fall back to
 * the raw id). */
export async function listAuditLog(ctx: TenantContext, limit = 50): Promise<AuditLogRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    });

    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
    const actors = actorIds.length
      ? await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(actors.map((a) => [a.id, a.name]));

    return rows.map((r) => ({
      ...r,
      actorName: r.actorId ? (nameById.get(r.actorId) ?? null) : null,
    }));
  });
}

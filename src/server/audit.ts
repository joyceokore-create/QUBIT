import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { pageInfo, type PageInfo } from "@/lib/list-state";
import { containsText } from "@/lib/list-query";

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

// ── UX5 (L4): server-paged audit log ───────────────────────────────────────────

/**
 * The validated query for one page of the audit log. The page allow-lists `action` and
 * `actor` against the values that exist in this tenant's log and turns the from/to days into
 * instants (tenant-local days, `dayRange`) before calling; this schema re-checks the shape
 * at the engine boundary (page size capped at 100).
 */
export const AuditListQuery = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.number().int().min(1).max(1_000_000).default(1),
  size: z.number().int().min(1).max(100),
  action: z.string().min(1).max(100).optional(),
  actor: z.string().min(1).max(100).optional(),
  /** Inclusive lower bound on createdAt. */
  from: z.date().optional(),
  /** Exclusive upper bound on createdAt. */
  to: z.date().optional(),
});
export type AuditListQuery = z.input<typeof AuditListQuery>;

async function withActorNames(tx: Prisma.TransactionClient, rows: Omit<AuditLogRow, "actorName">[]): Promise<AuditLogRow[]> {
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
  const actors = actorIds.length ? await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const nameById = new Map(actors.map((a) => [a.id, a.name]));
  return rows.map((r) => ({ ...r, actorName: r.actorId ? (nameById.get(r.actorId) ?? null) : null }));
}

/**
 * One page of the audit log, newest first: search (action, entity type or entity id),
 * action / actor / date-range filters and paging all in SQL, under the tenant's RLS context
 * (audit_log is FORCE RLS — another tenant's rows are invisible, not just filtered).
 */
export async function listAuditLogPaged(ctx: TenantContext, input: AuditListQuery): Promise<{ rows: AuditLogRow[]; info: PageInfo }> {
  const q = AuditListQuery.parse(input);
  const and: Prisma.AuditLogWhereInput[] = [];
  if (q.q) and.push({ OR: [{ action: containsText(q.q) }, { entityType: containsText(q.q) }, { entityId: containsText(q.q) }] });
  if (q.action) and.push({ action: q.action });
  if (q.actor) and.push({ actorId: q.actor });
  if (q.from || q.to) and.push({ createdAt: { ...(q.from && { gte: q.from }), ...(q.to && { lt: q.to }) } });
  const where: Prisma.AuditLogWhereInput = and.length ? { AND: and } : {};

  return withTenant(ctx, async (tx) => {
    const total = await tx.auditLog.count({ where });
    const info = pageInfo(total, q.page, q.size);
    const rows = total
      ? await tx.auditLog.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: info.skip,
          take: info.size,
          select: { id: true, actorId: true, action: true, entityType: true, entityId: true, createdAt: true },
        })
      : [];
    return { rows: await withActorNames(tx, rows), info };
  });
}

/**
 * The Action and Who filter options — the distinct actions and actors in THIS tenant's log
 * (SQL GROUP BY under RLS). They double as the allow-lists the page validates the URL
 * against. Actors resolve to user names; system actors ("seed-script") keep their raw id.
 */
export async function auditFilterOptions(ctx: TenantContext): Promise<{ actions: string[]; actors: { id: string; name: string }[] }> {
  return withTenant(ctx, async (tx) => {
    const [actions, actorGroups] = await Promise.all([
      tx.auditLog.groupBy({ by: ["action"], orderBy: { action: "asc" } }),
      tx.auditLog.groupBy({ by: ["actorId"], where: { actorId: { not: null } }, orderBy: { actorId: "asc" } }),
    ]);
    const ids = actorGroups.map((g) => g.actorId).filter((id): id is string => !!id);
    const users = ids.length ? await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    return {
      actions: actions.map((a) => a.action),
      actors: ids.map((id) => ({ id, name: nameById.get(id) ?? id })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

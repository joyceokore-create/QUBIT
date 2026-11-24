import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { pageInfo, type PageInfo } from "@/lib/list-state";
import { containsText } from "@/lib/list-query";
import { prisma } from "@/lib/db";
import { auditActionLabel, auditChange } from "@/lib/audit-view";

export interface AuditLogRow {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
}

/** UX fidelity Tier 2: a row in plain words. `change` is built from the allow-listed fields
 * only (lib/audit-view); the raw before/after JSON never leaves the server. */
export interface AuditViewRow extends AuditLogRow {
  actionLabel: string;
  record: string;
  change: string;
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

/** The WHERE for the list and the export. "role_changes" = role added or removed. Search
 * matches the action, the record type or id, and people's names (as actor or record). */
async function auditWhere(tx: Prisma.TransactionClient, q: ReturnType<typeof AuditListQuery.parse>): Promise<Prisma.AuditLogWhereInput> {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (q.q) {
    const people = await tx.user.findMany({ where: { name: containsText(q.q) }, select: { id: true }, take: 200 });
    const ids = people.map((p) => p.id);
    and.push({
      OR: [
        { action: containsText(q.q) },
        { entityType: containsText(q.q) },
        { entityId: containsText(q.q) },
        ...(ids.length ? [{ actorId: { in: ids } }, { entityId: { in: ids } }] : []),
      ],
    });
  }
  if (q.action === "role_changes") and.push({ action: { in: ["role_grant", "role_revoke"] } });
  else if (q.action) and.push({ action: q.action });
  if (q.actor) and.push({ actorId: q.actor });
  if (q.from || q.to) and.push({ createdAt: { ...(q.from && { gte: q.from }), ...(q.to && { lt: q.to }) } });
  return and.length ? { AND: and } : {};
}

const VIEW_SELECT = { id: true, actorId: true, action: true, entityType: true, entityId: true, createdAt: true, before: true, after: true } as const;

/** Record names for the rows: people, projects, teams and departments under RLS (another
 * tenant's record simply isn't found); access requests from the system table by id. */
async function toViewRows(tx: Prisma.TransactionClient, raw: Prisma.AuditLogGetPayload<{ select: typeof VIEW_SELECT }>[]): Promise<AuditViewRow[]> {
  const idsOf = (type: string) => [...new Set(raw.filter((r) => r.entityType === type).map((r) => r.entityId))];
  const [named, users, projects, teams, departments, tasks, requests] = await Promise.all([
    withActorNames(tx, raw.map(({ before: _b, after: _a, ...r }) => r)),
    idsOf("user").length ? tx.user.findMany({ where: { id: { in: idsOf("user") } }, select: { id: true, name: true } }) : [],
    idsOf("project").length ? tx.project.findMany({ where: { id: { in: idsOf("project") } }, select: { id: true, name: true } }) : [],
    idsOf("team").length ? tx.team.findMany({ where: { id: { in: idsOf("team") } }, select: { id: true, name: true } }) : [],
    idsOf("department").length ? tx.department.findMany({ where: { id: { in: idsOf("department") } }, select: { id: true, name: true } }) : [],
    idsOf("project_task").length ? tx.projectTask.findMany({ where: { id: { in: idsOf("project_task") } }, select: { id: true, title: true } }) : [],
    idsOf("access_request").length ? prisma.accessRequest.findMany({ where: { id: { in: idsOf("access_request") } }, select: { id: true, fullName: true } }) : [],
  ]);
  const names = new Map<string, string>([...users, ...projects, ...teams, ...departments].map((x) => [x.id, x.name] as [string, string]));
  for (const r of requests) names.set(r.id, `Request from ${r.fullName}`);
  for (const t of tasks) names.set(t.id, t.title);
  return named.map((r, i) => ({
    ...r,
    actionLabel: auditActionLabel(r.action, r.entityType),
    record: names.get(r.entityId) ?? (r.entityType === "tenant" ? "Organisation settings" : r.entityType.replace(/_/g, " ")),
    change: auditChange(r.action, raw[i].before, raw[i].after),
  }));
}

/**
 * One page of the audit log, newest first: search, action / actor / date-range filters and
 * paging all in SQL, under the tenant's RLS context (audit_log is FORCE RLS — another
 * tenant's rows are invisible, not just filtered).
 */
export async function listAuditLogPaged(ctx: TenantContext, input: AuditListQuery): Promise<{ rows: AuditViewRow[]; info: PageInfo }> {
  const q = AuditListQuery.parse(input);
  return withTenant(ctx, async (tx) => {
    const where = await auditWhere(tx, q);
    const total = await tx.auditLog.count({ where });
    const info = pageInfo(total, q.page, q.size);
    const raw = total ? await tx.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: info.skip, take: info.size, select: VIEW_SELECT }) : [];
    return { rows: await toViewRows(tx, raw), info };
  });
}

/** The CSV export: the same filters, newest first, capped. */
export const AUDIT_EXPORT_LIMIT = 5000;
export async function listAuditLogForExport(ctx: TenantContext, input: Omit<AuditListQuery, "page" | "size">): Promise<AuditViewRow[]> {
  const q = AuditListQuery.parse({ ...input, page: 1, size: 100 });
  return withTenant(ctx, async (tx) => {
    const where = await auditWhere(tx, q);
    const raw = await tx.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: AUDIT_EXPORT_LIMIT, select: VIEW_SELECT });
    return toViewRows(tx, raw);
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

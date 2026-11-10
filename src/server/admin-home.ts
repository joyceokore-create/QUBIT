import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { flagEnabled } from "@/lib/flags";
import { ssoEnabled } from "@/lib/sso";
import { accessRequestStatusCounts, listAccessRequestsPaged, oldestNewAccessRequestAt } from "@/server/access-requests";
import { activityLine, AR_TAB_SORT, AR_TAB_STATUS, collapseActivity, weekStartInZone, type ActivityRow, type AdminActivity, type AdminHomeData, type ArTab, type IntegrationRow } from "@/lib/admin-home";

/**
 * UX11 — Super Admin › Admin home, the reads (UX plan D3/D4, UX11). Every tenant-owned read
 * runs in ONE withTenant (RLS) transaction. access_request is the exception: a SYSTEM table
 * with no tenant_id (requests arrive from the public form before any tenant exists), read
 * through the existing functions in src/server/access-requests.ts and only for a viewer with
 * `iam:manage` — exactly as Admin › Access requests does. Each section is gated by the
 * permission that lets its reader act on it; a hidden section is null. Read-only: no writes.
 */

const ACTIVE_WINDOW_DAYS = 30;
const ACTIVITY_LIMIT = 5;
/** Over-fetch so collapsing create + role_grant pairs still leaves five lines. */
const ACTIVITY_FETCH = 20;


/** Audit rows that count as admin actions on the home's activity feed. */
export const ADMIN_ACTIVITY_WHERE: Prisma.AuditLogWhereInput = {
  OR: [
    { action: { in: ["role_grant", "role_revoke", "access_request_review", "view_switch"] } },
    { entityType: "user", action: { in: ["create", "delete"] } },
    { entityType: "user", action: "update", after: { path: ["mfa_reset"], equals: true } },
    { entityType: "user", action: "update", after: { path: ["status"], equals: "SUSPENDED" } },
    { entityType: "user", action: "update", after: { path: ["status"], equals: "ACTIVE" } },
  ],
};

export async function getAdminHome(
  ctx: TenantContext,
  opts: { tab: ArTab; page: number; size: number; timeZone: string },
  now: Date,
): Promise<AdminHomeData> {
  const tz = opts.timeZone;
  const sso = ssoEnabled();
  const mayReview = can(ctx, "iam:manage");
  const mayIntegrations = can(ctx, "integrations:manage");
  const mayInvite = can(ctx, "users:invite");
  const since30 = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 86_400_000);
  const weekStart = weekStartInZone(now, tz);

  // System-table reads (no tenant scope) — behind iam:manage only.
  const systemReads = mayReview
    ? Promise.all([
        accessRequestStatusCounts(),
        oldestNewAccessRequestAt(),
        listAccessRequestsPaged({ page: opts.page, size: opts.size, status: AR_TAB_STATUS[opts.tab], sort: AR_TAB_SORT[opts.tab] }),
      ])
    : Promise.resolve(null);

  const tenantReads = withTenant(ctx, async (tx) => {
    const [active, active30, noMfa, granted, removed, expiredInvites, suspendedInTeams, tenantIntegrations, projectGroups, failingGroups, audits, departments, teams] = await Promise.all([
      tx.user.count({ where: { status: "ACTIVE" } }),
      tx.user.count({ where: { status: "ACTIVE", lastLoginAt: { gte: since30 } } }),
      sso ? Promise.resolve(null) : tx.user.count({ where: { status: "ACTIVE", mfaSecret: null } }),
      tx.auditLog.count({ where: { action: "role_grant", createdAt: { gte: weekStart } } }),
      tx.auditLog.count({ where: { action: "role_revoke", createdAt: { gte: weekStart } } }),
      // People, not tokens: never signed in, not deleted, with an unused invite that ran out
      // and no unused invite still live (a resend replaces the old link).
      tx.user.count({
        where: {
          status: { not: "DELETED" },
          lastLoginAt: null,
          inviteTokens: { some: { purpose: "invite", consumedAt: null, expiresAt: { lt: now } } },
          NOT: { inviteTokens: { some: { purpose: "invite", consumedAt: null, expiresAt: { gte: now } } } },
        },
      }),
      tx.user.count({ where: { status: "SUSPENDED", teamMemberships: { some: {} } } }),
      mayIntegrations ? tx.tenantIntegration.findMany({ select: { provider: true, status: true, lastError: true }, orderBy: { provider: "asc" } }) : Promise.resolve([]),
      mayIntegrations
        ? tx.projectIntegration.groupBy({ by: ["provider"], where: { connected: true }, _count: { _all: true }, _max: { lastSyncAt: true } })
        : Promise.resolve([]),
      mayIntegrations
        ? tx.projectIntegration.groupBy({ by: ["provider"], where: { connected: true, lastSyncError: { not: null } }, _count: { _all: true } })
        : Promise.resolve([]),
      mayReview
        ? tx.auditLog.findMany({
            where: ADMIN_ACTIVITY_WHERE,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: ACTIVITY_FETCH,
            select: { id: true, action: true, entityType: true, entityId: true, actorId: true, before: true, after: true, createdAt: true },
          })
        : Promise.resolve([]),
      mayInvite ? tx.department.findMany({ select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }) : Promise.resolve([]),
      mayInvite ? tx.team.findMany({ select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }) : Promise.resolve([]),
    ]);

    // Names for the feed: actors and user targets, looked up under RLS (another tenant's
    // user can't be named here — it simply isn't found).
    const userIds = new Set<string>();
    for (const a of audits) {
      if (a.actorId) userIds.add(a.actorId);
      if (a.entityType === "user") userIds.add(a.entityId);
    }
    const people = userIds.size
      ? await tx.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
      : [];

    return { active, active30, noMfa, granted, removed, expiredInvites, suspendedInTeams, tenantIntegrations, projectGroups, failingGroups, audits, departments, teams, names: new Map(people.map((p) => [p.id, p.name])) };
  });

  const [sys, t] = await Promise.all([systemReads, tenantReads]);

  // Access-request rows + the names the feed needs for access_request_review targets, and the
  // reviewer of each reviewed row (named only if they're in this tenant).
  let requests: AdminHomeData["requests"] = null;
  const requestNames = new Map<string, string>();
  if (sys) {
    const [counts, , page] = sys;
    const reviewIds = t.audits.filter((a) => a.action === "access_request_review").map((a) => a.entityId);
    const reviewerIds = [...new Set(page.rows.map((r) => r.reviewedById).filter((x): x is string => !!x))].filter((id) => !t.names.has(id));
    const [arNames, reviewers] = await Promise.all([
      reviewIds.length ? prisma.accessRequest.findMany({ where: { id: { in: reviewIds } }, select: { id: true, fullName: true } }) : Promise.resolve([]),
      reviewerIds.length ? withTenant(ctx, (tx) => tx.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } })) : Promise.resolve([]),
    ]);
    for (const a of arNames) requestNames.set(a.id, a.fullName);
    for (const r of reviewers) t.names.set(r.id, r.name);
    requests = {
      tab: opts.tab,
      counts,
      info: page.info,
      rows: page.rows.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        email: r.email,
        company: r.company,
        jobTitle: r.jobTitle,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        reviewedBy: r.reviewedById ? (t.names.get(r.reviewedById) ?? null) : null,
      })),
    };
  }

  const integrations: IntegrationRow[] | null = mayIntegrations ? buildIntegrations(t.tenantIntegrations, t.projectGroups, t.failingGroups) : null;

  const activity: AdminActivity[] | null = mayReview
    ? collapseActivity(
        t.audits.map((a) => ({
          id: a.id,
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId,
          actorId: a.actorId,
          before: a.before,
          after: a.after,
          createdAt: a.createdAt.toISOString(),
          actorName: a.actorId ? (t.names.get(a.actorId) ?? null) : null,
          targetName: a.entityType === "user" ? (t.names.get(a.entityId) ?? null) : a.entityType === "access_request" ? (requestNames.get(a.entityId) ?? null) : null,
        })),
        ACTIVITY_LIMIT,
      ).map((r: ActivityRow) => ({ id: r.id, line: activityLine(r), actorName: r.actorName, createdAt: r.createdAt }))
    : null;

  return {
    timeZone: tz,
    sso,
    kpis: {
      waiting: sys ? { count: sys[0].NEW, oldestAt: sys[1]?.toISOString() ?? null } : null,
      activeUsers: { active30: t.active30, active: t.active, since: since30.toISOString() },
      noMfa: t.noMfa,
      roleChanges: { granted: t.granted, removed: t.removed, since: weekStart.toISOString() },
    },
    requests,
    attention: { noMfa: t.noMfa, expiredInvites: t.expiredInvites, suspendedInTeams: t.suspendedInTeams },
    integrations,
    activity,
    grant: mayInvite ? { departments: t.departments, teams: t.teams, canGrantSuperAdmin: ctx.roles.includes("PlatformSuperAdmin") } : null,
  };
}

/** One line per provider: the tenant connection (if any) merged with its project links. */
function buildIntegrations(
  tenantRows: { provider: string; status: string; lastError: string | null }[],
  projectGroups: { provider: string; _count: { _all: number }; _max: { lastSyncAt: Date | null } }[],
  failingGroups: { provider: string; _count: { _all: number } }[],
): IntegrationRow[] {
  const providers = [...new Set([...tenantRows.map((r) => r.provider), ...projectGroups.map((g) => g.provider)])].sort();
  return providers.map((provider) => {
    const tr = tenantRows.find((r) => r.provider === provider);
    const pg = projectGroups.find((g) => g.provider === provider);
    const fg = failingGroups.find((g) => g.provider === provider);
    return {
      provider,
      tenantStatus: tr?.status ?? null,
      tenantError: tr?.lastError ?? null,
      projects: pg?._count._all ?? 0,
      failingProjects: fg?._count._all ?? 0,
      lastRunAt: pg?._max.lastSyncAt?.toISOString() ?? null,
      enabled: provider === "youtrack" ? flagEnabled("youtrack") : true,
    };
  });
}

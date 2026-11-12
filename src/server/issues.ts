import { z } from "zod";
import { issueTitle } from "@/lib/issue-schema";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { pageInfo, type PageInfo } from "@/lib/list-state";
import {
  containsText,
  idOrNull,
  ownerIdsMatching,
  ownerNamesById,
  RaidPageBase,
  type RaidPageQuery,
} from "@/server/raid-shared";
import { GAP_ISSUE_WHERE, gapReasonOf, type GapReason } from "@/server/raid";
import { SEVERITY_ORDER } from "@/components/raid/severity";

export const ISSUE_STATUSES = ["Open", "Investigating", "Resolved", "Closed"] as const;

/** UX fidelity Tier 2: the "Status: Not closed" filter value (Open or Investigating). */
export const NOT_CLOSED = "notclosed";
export const ISSUE_STATUS_FILTERS = [NOT_CLOSED, ...ISSUE_STATUSES] as const;

/** UX fidelity Tier 2 — "+ New Issue" (design: Head of QA › Risks & Issues). */
export const CreateIssueInput = z.object({
  projectId: z.string().uuid().nullable().optional(),
  title: issueTitle,
  severity: z.enum(SEVERITY_ORDER),
  ownerId: z.string().uuid().nullable().optional(),
});
export type CreateIssueInput = z.infer<typeof CreateIssueInput>;

export const UpdateIssueInput = z.object({
  status: z.enum(ISSUE_STATUSES).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  severity: z.enum(SEVERITY_ORDER).optional(),
});
export type UpdateIssueInput = z.infer<typeof UpdateIssueInput>;

export class IssueError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export interface IssueListItem {
  id: string;
  title: string;
  severity: string;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  projectId: string | null;
  projectCode: string | null;
  projectName?: string | null;
  originRiskId: string | null;
  originRiskTitle: string | null;
  createdAt: Date;
}

export interface IssueListFilters {
  status?: string;
  severity?: string;
  ownerId?: string;
  projectId?: string;
  q?: string;
}

export async function listIssues(ctx: TenantContext, filters: IssueListFilters = {}): Promise<IssueListItem[]> {
  return withTenant(ctx, async (tx) => {
    const issues = await tx.issue.findMany({
      where: {
        status: filters.status || undefined,
        severity: filters.severity || undefined,
        ownerId: filters.ownerId || undefined,
        projectId: filters.projectId || undefined,
        title: filters.q ? containsText(filters.q) : undefined,
      },
      include: {
        project: { select: { code: true } },
        originRisk: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const ownerNames = await ownerNamesById(tx, issues.map((i) => i.ownerId));

    return issues.map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      status: i.status,
      ownerId: i.ownerId,
      ownerName: i.ownerId ? (ownerNames.get(i.ownerId) ?? null) : null,
      projectId: i.projectId,
      projectCode: i.project?.code ?? null,
      originRiskId: i.originRisk?.id ?? null,
      originRiskTitle: i.originRisk?.title ?? null,
      createdAt: i.createdAt,
    }));
  });
}

// ── UX5 (L4) — the Issues and Gap report tabs page, search and filter on the server ──

export const IssuePageParams = RaidPageBase.extend({
  status: z.enum(ISSUE_STATUS_FILTERS).optional(),
  /** Only issues with no owned, mitigated risk behind them (the Gap report). */
  gap: z.boolean().default(false),
});

export interface IssuePageRow extends IssueListItem {
  /** Why this issue is a gap, or null when it traces to an owned, mitigated risk. */
  gapReason: GapReason | null;
}

export interface IssuePage {
  rows: IssuePageRow[];
  /** Clamped page maths: an out-of-range page reads as the last page. */
  info: PageInfo;
}

/**
 * One page of the tenant's issues (or only its gaps) plus the total that match. Search
 * covers title, project code/name, origin risk title and owner name across ALL rows.
 * Runs under the tenant's RLS context; `where` only ever narrows within it.
 */
export async function listIssuesPage(ctx: TenantContext, query: RaidPageQuery & { gap?: boolean }): Promise<IssuePage> {
  const p = IssuePageParams.parse(query);
  return withTenant(ctx, async (tx) => {
    const and: Prisma.IssueWhereInput[] = [];
    if (p.gap) and.push(GAP_ISSUE_WHERE);
    if (p.projectId) and.push({ projectId: idOrNull(p.projectId) });
    if (p.ownerId) and.push({ ownerId: idOrNull(p.ownerId) });
    if (p.status === NOT_CLOSED) and.push({ status: { notIn: ["Resolved", "Closed"] } });
    else if (p.status) and.push({ status: p.status });
    if (p.severity) and.push({ severity: p.severity });
    if (p.q) {
      const c = containsText(p.q);
      const owners = await ownerIdsMatching(tx, p.q);
      and.push({
        OR: [
          { title: c },
          // The ID column shows the first characters of the issue id ("Search issues by ID").
          { id: { startsWith: p.q.toLowerCase().replace(/^#/, "") } },
          { project: { is: { code: c } } },
          { project: { is: { name: c } } },
          { originRisk: { is: { title: c } } },
          ...(owners.length ? [{ ownerId: { in: owners } }] : []),
        ],
      });
    }
    const where: Prisma.IssueWhereInput = and.length ? { AND: and } : {};

    const total = await tx.issue.count({ where });
    const info = pageInfo(total, p.page, p.size);
    const issues = await tx.issue.findMany({
      where,
      include: {
        project: { select: { code: true, name: true } },
        originRisk: { select: { id: true, title: true, ownerId: true, mitigation: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: info.skip,
      take: info.size,
    });

    const ownerNames = await ownerNamesById(tx, issues.map((i) => i.ownerId));
    const rows = issues.map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      status: i.status,
      ownerId: i.ownerId,
      ownerName: i.ownerId ? (ownerNames.get(i.ownerId) ?? null) : null,
      projectId: i.projectId,
      projectCode: i.project?.code ?? null,
      projectName: i.project?.name ?? null,
      originRiskId: i.originRisk?.id ?? null,
      originRiskTitle: i.originRisk?.title ?? null,
      createdAt: i.createdAt,
      gapReason: gapReasonOf(i.originRisk),
    }));
    return { rows, info };
  });
}

/**
 * Raise an issue directly (not materialised from a risk). The project and the owner are looked
 * up under the caller's RLS context, so another tenant's project or person is refused, not
 * stored. Audited. The route checks who may raise it (project contributor or issue:create).
 */
export async function createIssue(ctx: TenantContext, input: CreateIssueInput) {
  const data = CreateIssueInput.parse(input);
  return withTenant(ctx, async (tx) => {
    if (data.projectId && !(await tx.project.findUnique({ where: { id: data.projectId }, select: { id: true } }))) {
      throw new IssueError("Project not found.", "NOT_FOUND");
    }
    if (data.ownerId && !(await tx.user.findUnique({ where: { id: data.ownerId }, select: { id: true } }))) {
      throw new IssueError("Owner not found.", "NOT_FOUND");
    }
    const issue = await tx.issue.create({
      data: { tenantId: ctx.tenantId, projectId: data.projectId ?? null, title: data.title, severity: data.severity, ownerId: data.ownerId ?? null, status: "Open" },
    });
    await audit(tx, ctx, { action: "create", entityType: "issue", entityId: issue.id, after: { title: issue.title, severity: issue.severity, status: issue.status } });
    return issue;
  });
}

export async function updateIssue(ctx: TenantContext, issueId: string, input: UpdateIssueInput) {
  return withTenant(ctx, async (tx) => {
    const before = await tx.issue.findUniqueOrThrow({ where: { id: issueId } });

    const after = await tx.issue.update({
      where: { id: issueId },
      data: {
        status: input.status,
        ownerId: input.ownerId === undefined ? undefined : input.ownerId,
        severity: input.severity,
      },
    });

    await audit(tx, ctx, {
      action: "update",
      entityType: "issue",
      entityId: issueId,
      before: { status: before.status, ownerId: before.ownerId, severity: before.severity },
      after: { status: after.status, ownerId: after.ownerId, severity: after.severity },
    });

    return after;
  });
}

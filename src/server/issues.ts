import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { ownerNamesById } from "@/server/raid-shared";
import { SEVERITY_ORDER } from "@/components/raid/severity";

export const ISSUE_STATUSES = ["Open", "Investigating", "Resolved", "Closed"] as const;

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
        title: filters.q ? { contains: filters.q, mode: "insensitive" } : undefined,
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

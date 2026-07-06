import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { ownerNamesById } from "@/server/raid-shared";
import { heatBucket, SEVERITY_ORDER } from "@/components/raid/severity";

export const RISK_STATUSES = ["Open", "Monitoring", "Mitigated", "Closed"] as const;

export const CreateRiskInput = z.object({
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().min(3),
  category: z.string().nullable().optional(),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  mitigation: z.string().nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
});
export type CreateRiskInput = z.infer<typeof CreateRiskInput>;

export const UpdateRiskInput = z.object({
  status: z.enum(RISK_STATUSES).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  mitigation: z.string().nullable().optional(),
  probability: z.number().int().min(1).max(5).optional(),
  impact: z.number().int().min(1).max(5).optional(),
});
export type UpdateRiskInput = z.infer<typeof UpdateRiskInput>;

export const MaterialiseRiskInput = z.object({
  title: z.string().min(3).optional(),
  severity: z.enum(SEVERITY_ORDER).optional(),
});
export type MaterialiseRiskInput = z.infer<typeof MaterialiseRiskInput>;

export class RiskError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export interface RiskListItem {
  id: string;
  title: string;
  category: string | null;
  probability: number;
  impact: number;
  mitigation: string | null;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  projectId: string | null;
  projectCode: string | null;
  createdAt: Date;
  materialised: boolean;
}

export interface RiskListFilters {
  status?: string;
  ownerId?: string;
  projectId?: string;
  q?: string;
}

export async function listRisks(ctx: TenantContext, filters: RiskListFilters = {}): Promise<RiskListItem[]> {
  return withTenant(ctx, async (tx) => {
    const risks = await tx.risk.findMany({
      where: {
        status: filters.status || undefined,
        ownerId: filters.ownerId || undefined,
        projectId: filters.projectId || undefined,
        title: filters.q ? { contains: filters.q, mode: "insensitive" } : undefined,
      },
      include: {
        project: { select: { code: true } },
        issue: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const ownerNames = await ownerNamesById(tx, risks.map((r) => r.ownerId));

    return risks.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      probability: r.probability,
      impact: r.impact,
      mitigation: r.mitigation,
      status: r.status,
      ownerId: r.ownerId,
      ownerName: r.ownerId ? (ownerNames.get(r.ownerId) ?? null) : null,
      projectId: r.projectId,
      projectCode: r.project?.code ?? null,
      createdAt: r.createdAt,
      materialised: !!r.issue,
    }));
  });
}

export async function createRisk(ctx: TenantContext, input: CreateRiskInput) {
  return withTenant(ctx, async (tx) => {
    const risk = await tx.risk.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: input.projectId ?? null,
        title: input.title,
        category: input.category ?? null,
        probability: input.probability,
        impact: input.impact,
        mitigation: input.mitigation ?? null,
        ownerId: input.ownerId ?? null,
        status: "Open",
      },
    });

    await audit(tx, ctx, {
      action: "create",
      entityType: "risk",
      entityId: risk.id,
      after: {
        title: risk.title,
        category: risk.category,
        probability: risk.probability,
        impact: risk.impact,
        status: risk.status,
      },
    });

    return risk;
  });
}

export async function updateRisk(ctx: TenantContext, riskId: string, input: UpdateRiskInput) {
  return withTenant(ctx, async (tx) => {
    const before = await tx.risk.findUniqueOrThrow({ where: { id: riskId } });

    const after = await tx.risk.update({
      where: { id: riskId },
      data: {
        status: input.status,
        ownerId: input.ownerId === undefined ? undefined : input.ownerId,
        mitigation: input.mitigation === undefined ? undefined : input.mitigation,
        probability: input.probability,
        impact: input.impact,
      },
    });

    await audit(tx, ctx, {
      action: "update",
      entityType: "risk",
      entityId: riskId,
      before: {
        status: before.status,
        ownerId: before.ownerId,
        mitigation: before.mitigation,
        probability: before.probability,
        impact: before.impact,
      },
      after: {
        status: after.status,
        ownerId: after.ownerId,
        mitigation: after.mitigation,
        probability: after.probability,
        impact: after.impact,
      },
    });

    return after;
  });
}

export async function materialiseRisk(
  ctx: TenantContext,
  riskId: string,
  input: MaterialiseRiskInput,
): Promise<{ issueId: string }> {
  return withTenant(ctx, async (tx) => {
    const risk = await tx.risk.findUniqueOrThrow({ where: { id: riskId }, include: { issue: true } });
    if (risk.issue) {
      throw new RiskError("This risk has already been materialised into an issue.", "ALREADY_MATERIALISED");
    }

    const severity = input.severity ?? heatBucket(risk.probability, risk.impact);

    const issue = await tx.issue.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: risk.projectId,
        originRiskId: risk.id,
        title: input.title ?? risk.title,
        severity,
        ownerId: risk.ownerId,
        status: "Open",
      },
    });

    await audit(tx, ctx, {
      action: "create",
      entityType: "issue",
      entityId: issue.id,
      after: { title: issue.title, severity, originRiskId: risk.id },
    });

    await tx.risk.update({ where: { id: risk.id }, data: { status: "Closed" } });

    await audit(tx, ctx, {
      action: "update",
      entityType: "risk",
      entityId: risk.id,
      before: { status: risk.status },
      after: { status: "Closed", materialisedInto: issue.id },
    });

    return { issueId: issue.id };
  });
}

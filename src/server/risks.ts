import { z } from "zod";
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
import { heatBucket, SEVERITY_ORDER, type SeverityLevel } from "@/components/raid/severity";

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

const RISK_LIST_INCLUDE = {
  project: { select: { code: true } },
  issue: { select: { id: true } },
} satisfies Prisma.RiskInclude;

type RiskWithListInclude = Prisma.RiskGetPayload<{ include: typeof RISK_LIST_INCLUDE }>;

export async function listRisks(ctx: TenantContext, filters: RiskListFilters = {}): Promise<RiskListItem[]> {
  return withTenant(ctx, async (tx) => {
    const risks = await tx.risk.findMany({
      where: {
        status: filters.status || undefined,
        ownerId: filters.ownerId || undefined,
        projectId: filters.projectId || undefined,
        title: filters.q ? containsText(filters.q) : undefined,
      },
      include: RISK_LIST_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    return toRiskListItems(tx, risks);
  });
}

async function toRiskListItems(tx: Prisma.TransactionClient, risks: RiskWithListInclude[]): Promise<RiskListItem[]> {
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
}

// ── UX5 (L4) — the Risks tab pages, searches and filters on the server ───────────

export const RiskPageParams = RaidPageBase.extend({ status: z.enum(RISK_STATUSES).optional() });

export interface RiskPage {
  rows: RiskListItem[];
  /** Clamped page maths: an out-of-range page reads as the last page. */
  info: PageInfo;
}

/**
 * Risk severity is not a column — it is the heat bucket of probability × impact (1–5 each).
 * Filter on it by listing the (probability, impact) pairs that land in the bucket, which
 * keeps the filter a plain parameterised Prisma `OR` (at most 25 pairs).
 */
export function heatPairs(severity: SeverityLevel): Prisma.RiskWhereInput[] {
  const pairs: Prisma.RiskWhereInput[] = [];
  for (let probability = 1; probability <= 5; probability++) {
    for (let impact = 1; impact <= 5; impact++) {
      if (heatBucket(probability, impact) === severity) pairs.push({ probability, impact });
    }
  }
  return pairs;
}

/**
 * One page of the tenant's risks plus the total that match. Search covers title, category,
 * mitigation, project code/name and owner name across ALL rows (not just the page). Runs
 * under the tenant's RLS context; `where` only ever narrows within it.
 */
export async function listRisksPage(ctx: TenantContext, query: RaidPageQuery): Promise<RiskPage> {
  const p = RiskPageParams.parse(query);
  return withTenant(ctx, async (tx) => {
    const and: Prisma.RiskWhereInput[] = [];
    if (p.projectId) and.push({ projectId: idOrNull(p.projectId) });
    if (p.ownerId) and.push({ ownerId: idOrNull(p.ownerId) });
    if (p.status) and.push({ status: p.status });
    if (p.severity) and.push({ OR: heatPairs(p.severity) });
    if (p.q) {
      const c = containsText(p.q);
      const owners = await ownerIdsMatching(tx, p.q);
      and.push({
        OR: [
          { title: c },
          { category: c },
          { mitigation: c },
          { project: { is: { code: c } } },
          { project: { is: { name: c } } },
          ...(owners.length ? [{ ownerId: { in: owners } }] : []),
        ],
      });
    }
    const where: Prisma.RiskWhereInput = and.length ? { AND: and } : {};

    const total = await tx.risk.count({ where });
    const info = pageInfo(total, p.page, p.size);
    const risks = await tx.risk.findMany({
      where,
      include: RISK_LIST_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: info.skip,
      take: info.size,
    });
    return { rows: await toRiskListItems(tx, risks), info };
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

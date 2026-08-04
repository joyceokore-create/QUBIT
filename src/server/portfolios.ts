// M-P1b (docs/27 §2) — portfolio & programme creation, feeding the wizards. Server-only.
// Categories are the business-pipeline axis (docs/26 §2); markets are OrgUnit.kind=Market
// rows picked at org level and inherited by the project wizard.
import { z } from "zod";
import { audit } from "@/lib/audit";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { emitDomainEvent } from "@/server/events";

export class PortfolioError extends Error {
  code: string;
  constructor(message: string, code = "PORTFOLIO_ERROR") {
    super(message);
    this.code = code;
  }
}

export const CATEGORIES = ["Approved", "Exploring", "Shelved"] as const;
export const VIEW_KINDS = ["Pipeline", "Rollout"] as const;

export const CreatePortfolioSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  description: z.string().trim().max(500).optional(),
  category: z.enum(CATEGORIES).default("Exploring"),
  viewKind: z.enum(VIEW_KINDS).default("Pipeline"),
  ownerId: z.string().uuid().optional(),
  // Org-unit ids (kind=Market); only meaningful on Rollout portfolios.
  marketIds: z.array(z.string().uuid()).max(20).default([]),
});
export type CreatePortfolioInput = z.infer<typeof CreatePortfolioSchema>;

export const CreateProgrammeSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  description: z.string().trim().max(500).optional(),
  portfolioId: z.string().uuid(),
  category: z.enum(CATEGORIES).default("Exploring"),
});
export type CreateProgrammeInput = z.infer<typeof CreateProgrammeSchema>;

export async function createPortfolio(ctx: TenantContext, input: CreatePortfolioInput) {
  return withTenant(ctx, async (tx) => {
    if (input.ownerId) {
      // Owner must be a Head or Executive (docs/27 §1.4 — governance sits with governors).
      const owner = await tx.roleAssignment.findFirst({
        where: { userId: input.ownerId, role: { in: ["Executive", "HeadOfProjects", "PlatformSuperAdmin"] } },
        select: { id: true },
      });
      if (!owner) throw new PortfolioError("Owner must be a Head or Executive.", "OWNER_INELIGIBLE");
    }
    // Markets only apply to Rollout portfolios, and every id must be a real Market org unit.
    const marketIds = input.viewKind === "Rollout" ? input.marketIds : [];
    if (marketIds.length) {
      const found = await tx.orgUnit.count({ where: { id: { in: marketIds }, kind: "Market" } });
      if (found !== marketIds.length) {
        throw new PortfolioError("One or more markets are not valid market org units.", "BAD_MARKET");
      }
    }

    const portfolio = await tx.portfolio.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        viewKind: input.viewKind,
        ownerId: input.ownerId ?? null,
        defaultMarkets: marketIds.length ? marketIds : undefined,
      },
    });

    await audit(tx, ctx, {
      action: "create",
      entityType: "portfolio",
      entityId: portfolio.id,
      after: {
        name: portfolio.name,
        category: portfolio.category,
        viewKind: portfolio.viewKind,
        ownerId: portfolio.ownerId,
        defaultMarkets: marketIds,
      },
    });
    await emitDomainEvent(tx, ctx, {
      type: "portfolio.created",
      entityType: "portfolio",
      entityId: portfolio.id,
      payload: { name: portfolio.name, category: portfolio.category },
    });
    return portfolio;
  });
}

export async function createProgramme(ctx: TenantContext, input: CreateProgrammeInput) {
  return withTenant(ctx, async (tx) => {
    await tx.portfolio.findUniqueOrThrow({ where: { id: input.portfolioId } }).catch(() => {
      throw new PortfolioError("Portfolio not found.", "PORTFOLIO_NOT_FOUND");
    });
    const programme = await tx.programme.create({
      data: {
        tenantId: ctx.tenantId,
        portfolioId: input.portfolioId,
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        status: "Active",
      },
    });
    await audit(tx, ctx, {
      action: "create",
      entityType: "programme",
      entityId: programme.id,
      after: { name: programme.name, category: programme.category, portfolioId: programme.portfolioId },
    });
    return programme;
  });
}

export const UpdatePortfolioSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  category: z.enum(CATEGORIES).optional(),
  viewKind: z.enum(VIEW_KINDS).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  marketIds: z.array(z.string().uuid()).max(20).optional(),
});
export type UpdatePortfolioInput = z.infer<typeof UpdatePortfolioSchema>;

/** docs/27 §5 gap 1 (27-p1a §3) — governance edits on a portfolio, audited with a
 * before/after diff. Owner eligibility and market validation match createPortfolio. */
export async function updatePortfolio(ctx: TenantContext, id: string, input: UpdatePortfolioInput) {
  return withTenant(ctx, async (tx) => {
    const before = await tx.portfolio.findUnique({ where: { id } });
    if (!before) throw new PortfolioError("Portfolio not found.", "PORTFOLIO_NOT_FOUND");
    if (input.ownerId) {
      const owner = await tx.roleAssignment.findFirst({
        where: { userId: input.ownerId, role: { in: ["Executive", "HeadOfProjects", "PlatformSuperAdmin"] } },
        select: { id: true },
      });
      if (!owner) throw new PortfolioError("Owner must be a Head or Executive.", "OWNER_INELIGIBLE");
    }
    if (input.marketIds?.length) {
      const found = await tx.orgUnit.count({ where: { id: { in: input.marketIds }, kind: "Market" } });
      if (found !== input.marketIds.length) {
        throw new PortfolioError("One or more markets are not valid market org units.", "BAD_MARKET");
      }
    }
    const portfolio = await tx.portfolio.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.viewKind !== undefined ? { viewKind: input.viewKind } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
        ...(input.marketIds !== undefined ? { defaultMarkets: input.marketIds.length ? input.marketIds : undefined } : {}),
      },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "portfolio",
      entityId: id,
      before: { name: before.name, category: before.category, viewKind: before.viewKind, ownerId: before.ownerId },
      after: { name: portfolio.name, category: portfolio.category, viewKind: portfolio.viewKind, ownerId: portfolio.ownerId },
    });
    return portfolio;
  });
}

/** Market org units for the wizard's Markets step (chips). */
export async function listMarkets(ctx: TenantContext) {
  return withTenant(ctx, (tx) =>
    tx.orgUnit.findMany({
      where: { kind: "Market" },
      select: { id: true, code: true, name: true, flag: true },
      orderBy: { code: "asc" },
    }),
  );
}

/** Users eligible to own a portfolio (Head / Executive), for the wizard's owner picker. */
export async function eligibleOwners(ctx: TenantContext) {
  return withTenant(ctx, async (tx) => {
    const grants = await tx.roleAssignment.findMany({
      where: { role: { in: ["Executive", "HeadOfProjects", "PlatformSuperAdmin"] } },
      select: { userId: true },
    });
    const ids = [...new Set(grants.map((g) => g.userId))];
    if (!ids.length) return [];
    return tx.user.findMany({
      where: { id: { in: ids }, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });
}

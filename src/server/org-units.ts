import "server-only";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { withTenant, type TenantContext } from "@/lib/tenant";

/**
 * docs/38 — Admin › Organisation: the tenant's org units (markets a product ships into,
 * and internal subsidiaries). Until now they existed only in the seed. Units are never
 * deleted (instances, gate states and check-ins hang off them); a code is immutable
 * once set because projects, reports and the status-report matcher key on it.
 */

export class OrgUnitError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "CODE_TAKEN",
  ) {
    super(message);
    this.name = "OrgUnitError";
  }
}

export interface OrgUnitRow {
  id: string;
  code: string;
  name: string;
  flag: string | null;
  kind: string;
  /** Live instances using this unit. */
  projects: number;
  createdAt: Date;
}

export async function listOrgUnits(ctx: TenantContext): Promise<OrgUnitRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.orgUnit.findMany({
      select: { id: true, code: true, name: true, flag: true, kind: true, createdAt: true, _count: { select: { projectOrgStatuses: { where: { retiredAt: null } } } } },
      orderBy: [{ kind: "asc" }, { code: "asc" }],
    });
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, flag: r.flag, kind: r.kind, projects: r._count.projectOrgStatuses, createdAt: r.createdAt }));
  });
}

export const CreateOrgUnitInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,12}$/, "Code: 2–12 letters, digits or dashes."),
  name: z.string().trim().min(2).max(80),
  flag: z.string().trim().max(8).nullable().optional(),
  kind: z.enum(["Market", "Internal"]),
});

export async function createOrgUnit(ctx: TenantContext, input: z.infer<typeof CreateOrgUnitInput>): Promise<OrgUnitRow[]> {
  await withTenant(ctx, async (tx) => {
    const taken = await tx.orgUnit.findUnique({ where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } }, select: { id: true } });
    if (taken) throw new OrgUnitError(`${input.code} is already an org unit.`, "CODE_TAKEN");
    const row = await tx.orgUnit.create({ data: { tenantId: ctx.tenantId, code: input.code, name: input.name, flag: input.flag ?? null, kind: input.kind } });
    await audit(tx, ctx, { action: "create", entityType: "org_unit", entityId: row.id, after: { code: row.code, name: row.name, kind: row.kind, flag: row.flag } });
  });
  return listOrgUnits(ctx);
}

export const UpdateOrgUnitInput = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  flag: z.string().trim().max(8).nullable().optional(),
  kind: z.enum(["Market", "Internal"]).optional(),
});

export async function updateOrgUnit(ctx: TenantContext, id: string, input: z.infer<typeof UpdateOrgUnitInput>): Promise<OrgUnitRow[]> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.orgUnit.findUnique({ where: { id }, select: { id: true, name: true, flag: true, kind: true } });
    if (!before) throw new OrgUnitError("Org unit not found.", "NOT_FOUND");
    const after = await tx.orgUnit.update({ where: { id }, data: { name: input.name, flag: input.flag === undefined ? undefined : input.flag, kind: input.kind } });
    await audit(tx, ctx, { action: "update", entityType: "org_unit", entityId: id, before: { name: before.name, flag: before.flag, kind: before.kind }, after: { name: after.name, flag: after.flag, kind: after.kind } });
  });
  return listOrgUnits(ctx);
}

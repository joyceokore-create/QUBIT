// M-P1e (docs/31) — the one-time org-setup wizard's server: a THIN orchestrator over
// capabilities that already exist (brand on Tenant, Market org units, departments,
// checkpoint templates, the M-O3 invite path, P1-A portfolios). Every step is
// idempotent so the wizard is resumable; importPeople reports per-row outcomes and
// never aborts the batch. All of it is Super-Admin territory (iam:manage — route-gated,
// and re-checked here so no future caller can skip it).
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createUser } from "@/server/users";
import type { PeopleRow } from "@/lib/people-csv";
import type { UserGroup } from "@/lib/personas";

export class OrgSetupError extends Error {
  code: string;
  constructor(message: string, code = "ORG_SETUP_ERROR") {
    super(message);
    this.code = code;
  }
}

function assertSuperAdmin(ctx: TenantContext): void {
  if (!can(ctx, "iam:manage")) {
    throw new OrgSetupError("Organisation setup is Super-Admin territory.", "FORBIDDEN");
  }
}

/** The KCB rollout geographies (docs/18 §3.1) — the wizard's preselected market set. */
export const DEFAULT_MARKETS = [
  { code: "KE", name: "Kenya", flag: "🇰🇪" },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿" },
  { code: "UG", name: "Uganda", flag: "🇺🇬" },
  { code: "RW", name: "Rwanda", flag: "🇷🇼" },
  { code: "BI", name: "Burundi", flag: "🇧🇮" },
  { code: "SS", name: "South Sudan", flag: "🇸🇸" },
  { code: "DRC", name: "DR Congo", flag: "🇨🇩" },
] as const;

/** Mirrors the seed + the M-D-A migration — the two shipped delivery templates. */
const DEFAULT_TEMPLATES = [
  {
    name: "Product build",
    description: "Build-out gates for a product or platform (docs/18 §2).",
    gates: ["BRD", "Prototype", "MVP1", "SIT", "UAT", "Go-Live"],
  },
  {
    name: "Market rollout",
    description: "Gates for taking a product into a market (docs/18 §2).",
    gates: ["Business Case", "Contract", "Solution Build", "Bank Integration", "Telco Integration", "Testing", "GTM/Pilot", "Rollout"],
  },
] as const;

export const BrandInput = z.object({
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be #rrggbb."),
  brandLight: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function updateBrand(ctx: TenantContext, input: z.infer<typeof BrandInput>) {
  assertSuperAdmin(ctx);
  return withTenant(ctx, async (tx) => {
    const tenant = await tx.tenant.update({
      where: { id: ctx.tenantId },
      data: { brandColor: input.brandColor, ...(input.brandLight ? { brandLight: input.brandLight } : {}) },
      select: { brandColor: true, brandLight: true },
    });
    await audit(tx, ctx, { action: "update", entityType: "tenant", entityId: ctx.tenantId, after: tenant });
    return tenant;
  });
}

export async function seedMarkets(ctx: TenantContext, codes: string[]) {
  assertSuperAdmin(ctx);
  const wanted = DEFAULT_MARKETS.filter((m) => codes.includes(m.code));
  if (!wanted.length) throw new OrgSetupError("Pick at least one market.", "NO_MARKETS");
  return withTenant(ctx, async (tx) => {
    let created = 0;
    for (const m of wanted) {
      const existing = await tx.orgUnit.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: m.code } },
        select: { id: true },
      });
      if (existing) continue; // idempotent — re-running never duplicates
      await tx.orgUnit.create({
        data: { tenantId: ctx.tenantId, code: m.code, name: m.name, flag: m.flag, kind: "Market" },
      });
      created++;
    }
    if (created > 0) {
      await audit(tx, ctx, {
        action: "create",
        entityType: "org_unit",
        entityId: "org-setup-markets",
        after: { created, codes: wanted.map((m) => m.code) },
      });
    }
    return { created, total: wanted.length };
  });
}

export async function seedDepartments(ctx: TenantContext, names: string[]) {
  assertSuperAdmin(ctx);
  const clean = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2))];
  return withTenant(ctx, async (tx) => {
    let created = 0;
    for (const name of clean) {
      const existing = await tx.department.findFirst({ where: { name }, select: { id: true } });
      if (existing) continue;
      await tx.department.create({ data: { tenantId: ctx.tenantId, name } });
      created++;
    }
    if (created > 0) {
      await audit(tx, ctx, {
        action: "create",
        entityType: "department",
        entityId: "org-setup-departments",
        after: { created, names: clean },
      });
    }
    return { created, total: clean.length };
  });
}

export async function ensureDefaultTemplates(ctx: TenantContext) {
  assertSuperAdmin(ctx);
  return withTenant(ctx, async (tx) => {
    let created = 0;
    for (const t of DEFAULT_TEMPLATES) {
      const existing = await tx.checkpointTemplate.findFirst({ where: { name: t.name }, select: { id: true } });
      if (existing) continue;
      await tx.checkpointTemplate.create({
        data: {
          tenantId: ctx.tenantId,
          name: t.name,
          description: t.description,
          checkpoints: { create: t.gates.map((name, orderIndex) => ({ tenantId: ctx.tenantId, name, orderIndex })) },
        },
      });
      created++;
    }
    if (created > 0) {
      await audit(tx, ctx, {
        action: "create",
        entityType: "checkpoint_template",
        entityId: "org-setup-templates",
        after: { created },
      });
    }
    return { created, total: DEFAULT_TEMPLATES.length };
  });
}

export interface ImportRowResult {
  email: string;
  status: "invited" | "error";
  message?: string;
  /** Present only when the mailer is off — the admin copies the link (M-O3 rule). */
  acceptUrl?: string;
}

/** One createUser per row — each mints its own M-O3 invite (email or copyable link).
 * A failing row becomes an error RESULT, never an aborted batch (docs/31 §6). */
export async function importPeople(ctx: TenantContext, rows: PeopleRow[]): Promise<ImportRowResult[]> {
  assertSuperAdmin(ctx);
  const results: ImportRowResult[] = [];
  for (const row of rows) {
    try {
      const created = await createUser(ctx, {
        name: row.name,
        email: row.email,
        roles: [row.role],
        userGroups: row.group ? [row.group as UserGroup] : undefined,
      });
      results.push({
        email: row.email,
        status: "invited",
        ...(created.acceptUrl ? { acceptUrl: created.acceptUrl } : {}),
      });
    } catch (e) {
      results.push({
        email: row.email,
        status: "error",
        message: e instanceof Error ? e.message : "Could not invite.",
      });
    }
  }
  return results;
}

export async function completeSetup(ctx: TenantContext) {
  assertSuperAdmin(ctx);
  return withTenant(ctx, async (tx) => {
    await tx.tenant.update({ where: { id: ctx.tenantId }, data: { setupCompletedAt: new Date() } });
    await audit(tx, ctx, { action: "update", entityType: "tenant", entityId: ctx.tenantId, after: { orgSetupComplete: true } });
    return { ok: true };
  });
}

export interface SetupState {
  setupCompletedAt: Date | null;
  brandColor: string;
  markets: number;
  departments: number;
  templates: number;
  invitedPeople: number;
  portfolios: number;
}

/** Resumability (docs/31 §5): the wizard shows what already exists per step. */
export async function getSetupState(ctx: TenantContext): Promise<SetupState> {
  assertSuperAdmin(ctx);
  // Tenant is not RLS-scoped — read it bare; the rest under the tenant context.
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: ctx.tenantId },
    select: { setupCompletedAt: true, brandColor: true },
  });
  const counts = await withTenant(ctx, async (tx) => ({
    markets: await tx.orgUnit.count({ where: { kind: "Market" } }),
    departments: await tx.department.count(),
    templates: await tx.checkpointTemplate.count(),
    invitedPeople: await tx.user.count({ where: { status: "INVITED" } }),
    portfolios: await tx.portfolio.count(),
  }));
  return { ...tenant, ...counts };
}

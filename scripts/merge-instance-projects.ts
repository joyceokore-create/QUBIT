/**
 * docs/38 §7 — turn the per-market project shells into ONE product with instances.
 *
 *   pnpm tsx scripts/merge-instance-projects.ts --tenant riverbank --dry-run
 *   pnpm tsx scripts/merge-instance-projects.ts --tenant riverbank
 *
 * For each group below: create the product project (same portfolio as the shells, status
 * Planning, pmScope product, instanceLabel Market) with one instance per shell's market,
 * then archive the shells (status Cancelled + a status note naming the product). Refuses to
 * touch a shell that carries work (tasks, documents, risks, check-ins, gate states,
 * members or a lead) — those must be merged by hand. Runs under the tenant's RLS context
 * as the tenant's first Super Admin, through the app's own audit, so the merge is visible
 * in the audit log like any other change. Idempotent: an existing product is reused, an
 * instance already on it is skipped, an archived shell is left alone.
 */
import { prisma } from "../src/lib/db";
import { audit } from "../src/lib/audit";
import { withTenant, type TenantContext } from "../src/lib/tenant";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const DRY = process.argv.includes("--dry-run");

/** Shell code prefix → the product. The market is the part after the dash (KE, UG, DRC …). */
const GROUPS: { prefix: string; code: string; name: string; description: string }[] = [
  { prefix: "ZED-", code: "ZED", name: "ZED ERP", description: "ZED ERP across the group's markets — one product, one instance per market." },
  { prefix: "SWIPE-", code: "SWIPE", name: "Swipe Agent Banking", description: "Swipe Agent Banking solution — channels, markets and Hal device support." },
];
/** Shell suffix → org-unit code when they differ. */
const MARKET_ALIAS: Record<string, string> = { BI: "BI", DRC: "DRC", KE: "KE", RW: "RW", SS: "SS", TZ: "TZ", UG: "UG" };

async function main() {
  const slug = argValue("--tenant") ?? "riverbank";
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant "${slug}" not found.`);
  const admin = await withTenant({ tenantId: tenant.id, userId: "system" }, (tx) => tx.roleAssignment.findFirst({ where: { role: "PlatformSuperAdmin" }, select: { userId: true } }));
  if (!admin) throw new Error("No Super Admin in this tenant to act as.");
  const ctx: TenantContext = { tenantId: tenant.id, userId: admin.userId, roles: ["PlatformSuperAdmin"] };
  console.log(`${DRY ? "[dry-run] " : ""}tenant ${slug} · acting as ${admin.userId}`);

  await withTenant(ctx, async (tx) => {
    const units = await tx.orgUnit.findMany({ select: { id: true, code: true, kind: true } });
    const unitByCode = new Map(units.map((u) => [u.code.toUpperCase(), u]));

    for (const g of GROUPS) {
      const shells = await tx.project.findMany({
        where: { code: { startsWith: g.prefix }, status: { not: "Cancelled" } },
        select: {
          id: true, code: true, name: true, portfolioId: true, programmeId: true, checkpointTemplateId: true, leadUserId: true,
          _count: { select: { projectTasks: true, documents: true, risks: true, checkIns: true, checkpointStatuses: true, members: true } },
        },
        orderBy: { code: "asc" },
      });
      // The product itself may already carry the prefix (e.g. "ZED-SAFIRI" is NOT a market shell).
      const marketShells = shells.filter((s) => unitByCode.has(s.code.slice(g.prefix.length).toUpperCase()) || MARKET_ALIAS[s.code.slice(g.prefix.length).toUpperCase()]);
      if (!marketShells.length) {
        console.log(`${g.code}: no market shells found — skipped.`);
        continue;
      }
      const busy = marketShells.filter((s) => s.leadUserId || Object.values(s._count).some((n) => n > 0));
      if (busy.length) {
        console.log(`${g.code}: ${busy.map((b) => b.code).join(", ")} carry work — merge those by hand first. Nothing done for this group.`);
        continue;
      }
      const portfolioId = marketShells[0]!.portfolioId;
      let product = await tx.project.findFirst({ where: { code: g.code }, select: { id: true, code: true } });
      if (!product) {
        console.log(`${g.code}: create "${g.name}" in portfolio ${portfolioId} with ${marketShells.length} instances`);
        if (!DRY) {
          product = await tx.project.create({
            data: {
              tenantId: ctx.tenantId, code: g.code, name: g.name, description: g.description, type: "Project", priority: "High", status: "Planning",
              portfolioId, programmeId: marketShells[0]!.programmeId, checkpointTemplateId: marketShells.find((s) => s.checkpointTemplateId)?.checkpointTemplateId ?? null,
              instanceLabel: "Market", moduleTracking: "state", instanceTagging: true, pmScope: "product",
            },
            select: { id: true, code: true },
          });
          await audit(tx, ctx, { action: "create", entityType: "project", entityId: product.id, after: { code: g.code, name: g.name, mergedFrom: marketShells.map((s) => s.code), reason: "docs/38 §7" } });
        }
      } else console.log(`${g.code}: product exists (${product.id}) — reusing`);

      for (const s of marketShells) {
        const mk = s.code.slice(g.prefix.length).toUpperCase();
        const unit = unitByCode.get(MARKET_ALIAS[mk] ?? mk);
        if (!unit) {
          console.log(`  ${s.code}: no org unit for ${mk} — left alone`);
          continue;
        }
        console.log(`  ${s.code} → instance ${unit.code}; archive shell`);
        if (DRY || !product) continue;
        const existing = await tx.projectOrgStatus.findUnique({ where: { projectId_orgUnitId: { projectId: product.id, orgUnitId: unit.id } }, select: { id: true } });
        if (!existing) {
          const row = await tx.projectOrgStatus.create({ data: { tenantId: ctx.tenantId, projectId: product.id, orgUnitId: unit.id, progress: 0, status: "Planning" } });
          await audit(tx, ctx, { action: "create", entityType: "project_instance", entityId: row.id, after: { projectId: product.id, orgUnitId: unit.id, code: unit.code, mergedFrom: s.code } });
        }
        await tx.project.update({ where: { id: s.id }, data: { status: "Cancelled", statusNote: `Merged into ${g.code} as the ${unit.code} instance (docs/38).` } });
        await audit(tx, ctx, { action: "update", entityType: "project", entityId: s.id, before: { status: "Planning" }, after: { status: "Cancelled", mergedInto: g.code, instance: unit.code } });
      }
    }
  });
  console.log(DRY ? "dry-run complete — nothing written." : "done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

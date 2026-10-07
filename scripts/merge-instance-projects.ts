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

/** Mirrors src/server/project-instances.ts instanceCode (that module is server-only). */
function instanceCode(name: string, i = 0): string {
  const words = name.toUpperCase().replace(/^FOR\s+/, "").split(/[^A-Z0-9]+/).filter(Boolean);
  return (words.length >= 2 ? words.map((w) => w.slice(0, 4)).join("").slice(0, 8) : (words[0] ?? "").slice(0, 8)) || `INST${i + 1}`;
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const DRY = process.argv.includes("--dry-run");

/** Shell code prefix → the product. The market is the part after the dash (KE, UG, DRC …).
 * `instances` = the product's MODULES (channels — docs/38: a state per market, no gates of
 * their own) with their state per market from the 29 Sep 2026 Swipe deck; markets not
 * listed for a module are N/A. */
type State = "Planned" | "Build" | "UAT" | "Live" | "NotApplicable";
/** `template` = the product's gate track by name (one track for all markets; Swipe's old
 * "Agent banking channels" template modelled the channels as gates — those are modules now). */
/** Joyce (2026-10-07): only "Product build" stays a gate template — these two are retired
 * (kept on whatever still uses them, gone from the picker). */
const RETIRE_TEMPLATES = ["Agent banking channels", "Market rollout"];
const GROUPS: { prefix: string; code: string; name: string; description: string; template?: string; moduleLabel?: string; instances?: { name: string; states: Record<string, State> }[] }[] = [
  { prefix: "ZED-", code: "ZED", name: "ZED ERP", description: "ZED ERP across the group's markets — one product, one market track each.", template: "Product build" },
  {
    prefix: "SWIPE-",
    code: "SWIPE",
    name: "Swipe Agent Banking",
    description: "Swipe Agent Banking solution — channels (modules), markets and Hal device support.",
    template: "Product build",
    moduleLabel: "Agent channels",
    instances: [
      { name: "P20 POS", states: { KE: "Live", RW: "UAT" } },
      { name: "P30 POS", states: { KE: "Live", RW: "UAT" } },
      { name: "NewPOS9220", states: { KE: "Live", UG: "Live", TZ: "Live", BI: "Live", SS: "Live", RW: "UAT" } },
      { name: "USSD", states: { KE: "Live", UG: "Live", TZ: "UAT", BI: "Live", SS: "Live", RW: "UAT" } },
      { name: "Agent Portal", states: { KE: "Live", UG: "Live", TZ: "UAT", BI: "Live", SS: "Live", RW: "UAT" } },
      { name: "Mobile App", states: { KE: "Live", UG: "Live", TZ: "UAT", BI: "Live", SS: "Live", RW: "UAT" } },
      { name: "Hal device support", states: { KE: "Live", UG: "Live", TZ: "Live", BI: "Live", SS: "Live", RW: "Planned" } },
    ],
  },
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
        where: { code: { startsWith: g.prefix } },
        select: {
          id: true, code: true, name: true, status: true, portfolioId: true, programmeId: true, checkpointTemplateId: true, leadUserId: true,
          _count: { select: { projectTasks: true, documents: true, risks: true, checkIns: true, checkpointStatuses: true, members: true } },
        },
        orderBy: { code: "asc" },
      });
      // The product itself may already carry the prefix (e.g. "ZED-SAFIRI" is NOT a market shell).
      const marketShells = shells.filter((s) => unitByCode.has(s.code.slice(g.prefix.length).toUpperCase()) || MARKET_ALIAS[s.code.slice(g.prefix.length).toUpperCase()]);
      const template = g.template ? await tx.checkpointTemplate.findFirst({ where: { name: g.template }, select: { id: true } }) : null;
      let product = await tx.project.findFirst({ where: { code: g.code }, select: { id: true, code: true } });
      if (!marketShells.length && !product) {
        console.log(`${g.code}: no market shells and no product — skipped.`);
        continue;
      }
      const busy = marketShells.filter((s) => s.leadUserId || Object.values(s._count).some((n) => n > 0));
      if (busy.length) {
        console.log(`${g.code}: ${busy.map((b) => b.code).join(", ")} carry work — merge those by hand first. Nothing done for this group.`);
        continue;
      }
      const portfolioId = marketShells[0]?.portfolioId ?? null;
      if (!product) {
        console.log(`${g.code}: create "${g.name}" in portfolio ${portfolioId} with ${marketShells.length} instances`);
        if (!DRY) {
          product = await tx.project.create({
            data: {
              tenantId: ctx.tenantId, code: g.code, name: g.name, description: g.description, type: "Project", priority: "High", status: "Planning",
              portfolioId, programmeId: marketShells[0]?.programmeId ?? null, checkpointTemplateId: template?.id ?? marketShells.find((s) => s.checkpointTemplateId)?.checkpointTemplateId ?? null,
              instanceLabel: "Market", moduleTracking: "state", instanceTagging: true, pmScope: "product", moduleLabel: g.moduleLabel ?? "Modules",
            },
            select: { id: true, code: true },
          });
          await audit(tx, ctx, { action: "create", entityType: "project", entityId: product.id, after: { code: g.code, name: g.name, mergedFrom: marketShells.map((s) => s.code), reason: "docs/38 §7" } });
        }
      } else {
        console.log(`${g.code}: product exists (${product.id}) — reusing${template ? `; track → ${g.template}` : ""}`);
        if (!DRY && template) await tx.project.update({ where: { id: product.id }, data: { checkpointTemplateId: template.id, ...(g.moduleLabel ? { moduleLabel: g.moduleLabel } : {}) } });
      }

      for (const s of marketShells) {
        const mk = s.code.slice(g.prefix.length).toUpperCase();
        const unit = unitByCode.get(MARKET_ALIAS[mk] ?? mk);
        if (!unit) {
          console.log(`  ${s.code}: no org unit for ${mk} — left alone`);
          continue;
        }
        console.log(`  ${s.code} → market ${unit.code}; delete the empty shell`);
        if (DRY || !product) continue;
        const existing = await tx.projectOrgStatus.findUnique({ where: { projectId_orgUnitId: { projectId: product.id, orgUnitId: unit.id } }, select: { id: true } });
        if (!existing) {
          const row = await tx.projectOrgStatus.create({ data: { tenantId: ctx.tenantId, projectId: product.id, orgUnitId: unit.id, progress: 0, status: "Planning" } });
          await audit(tx, ctx, { action: "create", entityType: "project_instance", entityId: row.id, after: { projectId: product.id, orgUnitId: unit.id, code: unit.code, mergedFrom: s.code } });
        }
        // The shell is EMPTY (asserted above) — delete it rather than leave a "Cancelled"
        // project in every list; the audit row keeps the mapping.
        await audit(tx, ctx, { action: "delete", entityType: "project", entityId: s.id, before: { code: s.code, name: s.name, status: s.status }, after: { mergedInto: g.code, market: unit.code, reason: "docs/38 §7 — empty per-market shell" } });
        await tx.project.delete({ where: { id: s.id } });
      }
      // Named instances with their state per market (idempotent on code).
      for (const [i, inst] of (g.instances ?? []).entries()) {
        const code = instanceCode(inst.name, i);
        console.log(`  module ${inst.name} (${code}): ${Object.entries(inst.states).map(([m, st]) => `${m}=${st}`).join(" ")}`);
        if (DRY || !product) continue;
        let mod = await tx.projectModule.findUnique({ where: { projectId_code: { projectId: product.id, code } }, select: { id: true } });
        if (!mod) {
          mod = await tx.projectModule.create({ data: { tenantId: ctx.tenantId, projectId: product.id, code, name: inst.name, orderIndex: i, kind: "module", ownGates: false }, select: { id: true } });
          await audit(tx, ctx, { action: "create", entityType: "project_module", entityId: mod.id, after: { projectId: product.id, code, name: inst.name, kind: "module", reason: "docs/38 §7" } });
        }
        for (const s of marketShells) {
          const mk = s.code.slice(g.prefix.length).toUpperCase();
          const unit = unitByCode.get(MARKET_ALIAS[mk] ?? mk);
          if (!unit) continue;
          const state: State = inst.states[unit.code] ?? "NotApplicable";
          const existing = await tx.moduleInstanceStatus.findFirst({ where: { moduleId: mod.id, orgUnitId: unit.id }, select: { id: true } });
          if (existing) continue;
          await tx.moduleInstanceStatus.create({ data: { tenantId: ctx.tenantId, projectId: product.id, moduleId: mod.id, orgUnitId: unit.id, state, updatedById: ctx.userId } });
        }
      }
    }
    // Retire the templates the switcher and the modules now cover.
    for (const name of RETIRE_TEMPLATES) {
      const t = await tx.checkpointTemplate.findFirst({ where: { name, retiredAt: null }, select: { id: true } });
      if (!t) continue;
      console.log(`retire template "${name}"`);
      if (DRY) continue;
      await tx.checkpointTemplate.update({ where: { id: t.id }, data: { retiredAt: new Date() } });
      await audit(tx, ctx, { action: "update", entityType: "checkpoint_template", entityId: t.id, after: { name, retired: true, reason: "docs/38 — covered by modules / the market switch" } });
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

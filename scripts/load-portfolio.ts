/**
 * Load the real Riverbank delivery portfolio from a dated deck snapshot
 * (scripts/data/portfolio-snapshot-*.ts). Safe to run against production.
 *
 *   pnpm tsx scripts/load-portfolio.ts --tenant riverbank            # apply
 *   pnpm tsx scripts/load-portfolio.ts --tenant riverbank --dry-run  # show what would change
 *
 * IDEMPOTENT: keyed on project CODE. Re-running updates a project's stage/priority/note
 * and re-states its gates; it never duplicates a project, and it never deletes anything
 * it did not create. Existing projects not in the snapshot are left completely alone and
 * listed at the end so nothing goes missing silently.
 *
 * Percentages: QUBIT derives % from gate state (docs/18 — "% is derived, never typed"), so
 * the deck's figure is written into the status note, not into a progress column. Every
 * material divergence is printed, because that difference is a real conversation to have
 * with whoever maintains the deck.
 */
import { prisma } from "../src/lib/db";
import { withTenant, type TenantContext } from "../src/lib/tenant";
import {
  AGENT_CHANNEL_GATES,
  MARKET_ROLLOUT_GATES,
  PIPELINE,
  PORTFOLIOS,
  PRODUCT_BUILD_GATES,
  ROLLOUT_PORTFOLIOS,
  type Gate,
} from "./data/portfolio-snapshot-2026-06-30";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const DRY = process.argv.includes("--dry-run");
const log = (s: string) => console.log(`${DRY ? "[dry-run] " : ""}${s}`);

/** Gate states → the % QUBIT will show (mirrors checkpointProgressByProject: Done=1,
 * InProgress=0.5, else 0). Kept here only to REPORT divergence from the deck. */
function derivedPct(gates: Gate[]): number {
  const score = gates.reduce((a, g) => a + (g === "Done" ? 1 : g === "InProgress" ? 0.5 : 0), 0);
  return Math.round((score / gates.length) * 100);
}

async function main() {
  const slug = argValue("--tenant") ?? "riverbank";
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant "${slug}" not found.`);
  const tenantId = tenant.id; // narrowed once — the closures below lose the null check
  const ctx: TenantContext = { tenantId, userId: "system-loader", roles: ["PlatformSuperAdmin"] };

  const divergences: string[] = [];
  const touched = new Set<string>();

  await withTenant(ctx, async (tx) => {
    // ── Portfolios ────────────────────────────────────────────────────────────
    const portfolioIds = new Map<string, string>();
    for (const p of PORTFOLIOS) {
      const existing = await tx.portfolio.findFirst({ where: { name: p.name }, select: { id: true } });
      if (existing) {
        portfolioIds.set(p.name, existing.id);
        log(`portfolio “${p.name}” — exists`);
      } else if (DRY) {
        portfolioIds.set(p.name, "dry-run");
        log(`portfolio “${p.name}” — WOULD CREATE (${p.viewKind} lens)`);
      } else {
        const created = await tx.portfolio.create({
          data: { tenantId, name: p.name, description: p.description, viewKind: p.viewKind, category: "Approved" },
          select: { id: true },
        });
        portfolioIds.set(p.name, created.id);
        log(`portfolio “${p.name}” — CREATED (${p.viewKind} lens)`);
      }
    }

    // ── Checkpoint templates (Product build + Market rollout ship with the tenant;
    //    the agent-channel one is new because deck 4/5's columns are channels) ──
    const templateIds = new Map<string, string>();
    const TEMPLATES = [
      { name: "Product build", gates: PRODUCT_BUILD_GATES },
      { name: "Market rollout", gates: MARKET_ROLLOUT_GATES },
      { name: "Agent banking channels", gates: AGENT_CHANNEL_GATES },
    ];
    for (const t of TEMPLATES) {
      const found = await tx.checkpointTemplate.findFirst({ where: { name: t.name }, select: { id: true } });
      if (found) {
        templateIds.set(t.name, found.id);
      } else if (DRY) {
        templateIds.set(t.name, "dry-run");
        log(`template “${t.name}” — WOULD CREATE (${t.gates.length} gates)`);
      } else {
        const created = await tx.checkpointTemplate.create({
          data: {
            tenantId,
            name: t.name,
            description: `Gates transcribed from the delivery decks (${t.gates.join(" → ")}).`,
            checkpoints: { create: t.gates.map((name, orderIndex) => ({ tenantId, name, orderIndex })) },
          },
          select: { id: true },
        });
        templateIds.set(t.name, created.id);
        log(`template “${t.name}” — CREATED`);
      }
    }

    /** Upsert a project by code and return its id (null in dry-run when new). */
    async function upsertProject(input: {
      code: string; name: string; description: string; priority: string; stage: string;
      portfolioName: string; templateName: string; note: string;
    }): Promise<string | null> {
      touched.add(input.code);
      const portfolioId = portfolioIds.get(input.portfolioName)!;
      const checkpointTemplateId = templateIds.get(input.templateName)!;
      const existing = await tx.project.findUnique({ where: { tenantId_code: { tenantId, code: input.code } }, select: { id: true } });
      const data = {
        name: input.name,
        description: input.description,
        priority: input.priority,
        pipelineStage: input.stage,
        statusNote: input.note,
        portfolioId,
        checkpointTemplateId,
      };
      if (existing) {
        if (!DRY) await tx.project.update({ where: { id: existing.id }, data });
        log(`  ${input.code} ${input.name} — updated`);
        return existing.id;
      }
      if (DRY) {
        log(`  ${input.code} ${input.name} — WOULD CREATE (${input.stage}, ${input.priority})`);
        return null;
      }
      const created = await tx.project.create({
        data: {
          ...data,
          tenantId,
          code: input.code,
          type: "Project",
          // Delivery status stays Planning until a PM confirms a check-in — the reporting
          // chain owns status, not this loader (docs/25 §5).
          status: input.stage === "Paused" ? "Planning" : "Planning",
        },
        select: { id: true },
      });
      log(`  ${input.code} ${input.name} — CREATED`);
      return created.id;
    }

    /** Write the gate states for a project track (orgUnitId null = the project's own). */
    async function setGates(projectId: string | null, templateName: string, gates: Gate[], orgUnitId: string | null) {
      if (!projectId || DRY) return;
      const template = await tx.checkpointTemplate.findUniqueOrThrow({
        where: { id: templateIds.get(templateName)! },
        select: { checkpoints: { select: { id: true, name: true, orderIndex: true }, orderBy: { orderIndex: "asc" } } },
      });
      for (const [i, cp] of template.checkpoints.entries()) {
        const state = gates[i] ?? "NotStarted";
        const existing = await tx.checkpointStatus.findFirst({ where: { projectId, checkpointId: cp.id, orgUnitId } });
        if (existing) {
          await tx.checkpointStatus.update({ where: { id: existing.id }, data: { state } });
        } else {
          await tx.checkpointStatus.create({ data: { tenantId, projectId, checkpointId: cp.id, orgUnitId, state } });
        }
      }
    }

    // ── Deck 1: the pipeline projects ─────────────────────────────────────────
    log(`\nAI Initiatives — ${PIPELINE.length} projects`);
    for (const p of PIPELINE) {
      const derived = derivedPct(p.gates);
      const note = `${p.note} (deck: ${p.statedPct}%)`;
      const id = await upsertProject({
        code: p.code, name: p.name, description: p.description, priority: p.priority, stage: p.stage,
        portfolioName: "AI Initiatives", templateName: "Product build", note,
      });
      await setGates(id, "Product build", p.gates, null);
      if (Math.abs(derived - p.statedPct) > 15) {
        divergences.push(`${p.code} ${p.name}: deck says ${p.statedPct}%, gates derive ${derived}%`);
      }
    }

    // ── Decks 2–5: ZED ERP and Swipe are PORTFOLIOS; each deck row is a market
    //    implementation, which is the unit the business tracks and staffs, so each row
    //    becomes a project inside its portfolio and the deck columns become its gates.
    const markets = await tx.orgUnit.findMany({ where: { kind: "Market" }, select: { id: true, code: true } });
    const marketId = new Map(markets.map((m) => [m.code, m.id]));

    for (const rp of ROLLOUT_PORTFOLIOS) {
      let pfId = portfolioIds.get(rp.name);
      if (!pfId) {
        const existing = await tx.portfolio.findFirst({ where: { name: rp.name }, select: { id: true } });
        if (existing) {
          pfId = existing.id;
          log(`\nportfolio “${rp.name}” — exists`);
        } else if (DRY) {
          pfId = "dry-run";
          log(`\nportfolio “${rp.name}” — WOULD CREATE (Rollout lens)`);
        } else {
          const created = await tx.portfolio.create({
            data: { tenantId, name: rp.name, description: rp.description, viewKind: "Rollout", category: "Approved" },
            select: { id: true },
          });
          pfId = created.id;
          log(`\nportfolio “${rp.name}” — CREATED (Rollout lens)`);
        }
        portfolioIds.set(rp.name, pfId);
      } else {
        log(`\nportfolio “${rp.name}” — exists`);
      }

      for (const mp of rp.projects) {
        const ouId = marketId.get(mp.market);
        if (!ouId) {
          log(`  ! market ${mp.market} is not an OrgUnit — skipped`);
          continue;
        }
        const derived = derivedPct(mp.gates);
        const pct = mp.statedPct ?? derived;
        const note = mp.statedPct === null ? mp.note : `${mp.note} (deck: ${mp.statedPct}%)`;
        const id = await upsertProject({
          code: `${rp.codePrefix}-${mp.market}`,
          name: `${rp.name} — ${mp.marketName}`,
          description: `${rp.name} implementation for ${mp.marketName}.`,
          priority: rp.priority,
          stage: "Approved",
          portfolioName: rp.name,
          templateName: rp.template,
          note,
        });
        // Gates on the project's OWN track so QUBIT derives its %, plus the market's
        // org-status row so the rollout heat map and market strip have something to read.
        await setGates(id, rp.template, mp.gates, null);
        if (id && !DRY) {
          const existing = await tx.projectOrgStatus.findFirst({ where: { projectId: id, orgUnitId: ouId } });
          const data = { progress: pct, status: pct >= 40 ? "OnTrack" : "AtRisk" };
          if (existing) await tx.projectOrgStatus.update({ where: { id: existing.id }, data });
          else await tx.projectOrgStatus.create({ data: { ...data, tenantId, projectId: id, orgUnitId: ouId } });
        }
        if (mp.statedPct !== null && Math.abs(derived - mp.statedPct) > 15) {
          divergences.push(`${rp.codePrefix}-${mp.market} ${mp.marketName}: deck says ${mp.statedPct}%, gates derive ${derived}%`);
        }
      }
    }

    // ── What was already there and is NOT in the snapshot ─────────────────────
    const all = await tx.project.findMany({ select: { code: true, name: true } });
    const untouched = all.filter((p) => !touched.has(p.code));
    if (untouched.length) {
      log(`\nLEFT ALONE (not in the snapshot — nothing was deleted):`);
      for (const p of untouched) log(`  ${p.code} ${p.name}`);
    }
  });

  if (divergences.length) {
    console.log(`\n⚠ deck % vs gate-derived % (>15pt apart) — the gates are what QUBIT shows:`);
    for (const d of divergences) console.log(`  ${d}`);
  }
  console.log(`\n${DRY ? "Dry run complete — nothing written." : "Load complete."}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

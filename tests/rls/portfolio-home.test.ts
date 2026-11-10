// UX10 — Executive › Portfolio home extras (decision blockers, next milestones, confirmed
// check-in lines). Requires a migrated, seeded DB. Synthetic data only; cleans up after itself.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId, shiftIsoWeek } from "@/lib/iso-week";
import { getPortfolioHomeExtras } from "@/server/portfolio-home";
import { getReportsWeek } from "@/server/reports-week";
import { createUsers, cleanupFixtureUsers } from "./_users";

const DAY = 86_400_000;

describe("UX10 Portfolio home extras", () => {
  const now = new Date();
  let rbId: string;
  let bId: string;
  let exec: TenantContext;
  let bExec: TenantContext;
  let aProject: string;
  let bProject: string;

  beforeAll(async () => {
    const [rb, b] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !b) throw new Error("Seed required.");
    rbId = rb.id;
    bId = b.id;
    const [[e], [be]] = await Promise.all([createUsers(rbId, 1, "phome"), createUsers(bId, 1, "phome")]);
    exec = { tenantId: rbId, userId: e.id, roles: ["Executive"] };
    bExec = { tenantId: bId, userId: be.id, roles: ["Executive"] };

    aProject = await withTenant(exec, async (tx) => {
      const p = await tx.project.create({
        data: { tenantId: rbId, code: "PHA1", name: "Portfolio home fixture A", type: "Project", priority: "High", status: "OnTrack" },
        select: { id: true },
      });
      await tx.blocker.create({ data: { tenantId: rbId, projectId: p.id, description: "Fixture A critical blocker", severity: "Critical" } });
      await tx.blocker.create({ data: { tenantId: rbId, projectId: p.id, description: "Fixture A fresh minor blocker", severity: "Low" } });
      for (const [i, name] of ["Fixture M1", "Fixture M2", "Fixture M3", "Fixture M4"].entries()) {
        await tx.projectMilestone.create({ data: { tenantId: rbId, projectId: p.id, name, dueDate: new Date(now.getTime() + (i + 1) * DAY) } });
      }
      await tx.projectMilestone.create({ data: { tenantId: rbId, projectId: p.id, name: "Fixture done", status: "Done", dueDate: new Date(now.getTime() - DAY) } });
      const w = isoWeekId(now);
      await tx.checkIn.create({ data: { tenantId: rbId, projectId: p.id, isoWeek: shiftIsoWeek(w, -1), status: "Confirmed", computedRag: "Green", narrative: "Older synthetic line", confirmedAt: new Date(now.getTime() - 7 * DAY) } });
      await tx.checkIn.create({ data: { tenantId: rbId, projectId: p.id, isoWeek: w, status: "Draft", computedRag: "Amber", narrative: "Draft line, not confirmed" } });
      return p.id;
    });
    bProject = await withTenant(bExec, async (tx) => {
      const p = await tx.project.create({
        data: { tenantId: bId, code: "PHB1", name: "Portfolio home fixture B", type: "Project", priority: "High", status: "OnTrack" },
        select: { id: true },
      });
      await tx.blocker.create({ data: { tenantId: bId, projectId: p.id, description: "Fixture B critical blocker", severity: "Critical" } });
      await tx.projectMilestone.create({ data: { tenantId: bId, projectId: p.id, name: "Fixture B milestone", dueDate: new Date(now.getTime() + DAY) } });
      await tx.checkIn.create({ data: { tenantId: bId, projectId: p.id, isoWeek: isoWeekId(now), status: "Confirmed", computedRag: "Green", narrative: "Tenant B line", confirmedAt: now } });
      return p.id;
    });
  });

  afterAll(async () => {
    await withTenant(exec, (tx) => tx.project.deleteMany({ where: { id: aProject } }));
    await withTenant(bExec, (tx) => tx.project.deleteMany({ where: { id: bProject } }));
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  it("gives the next three pending milestones and the latest CONFIRMED line", async () => {
    const x = await getPortfolioHomeExtras(exec, [aProject], now);
    expect(x.nextMilestones[aProject]?.map((m) => m.name)).toEqual(["Fixture M1", "Fixture M2", "Fixture M3"]);
    expect(x.lastLine[aProject]?.line).toBe("Older synthetic line");
  });

  it("blockers needing a decision are the same list as Reports › This week for Executives", async () => {
    const x = await getPortfolioHomeExtras(exec, [aProject], now);
    const week = await getReportsWeek(exec, { isoWeek: isoWeekId(now), view: "exec", now });
    if (week.kind !== "exec") throw new Error("expected the exec view");
    expect(x.decisionBlockers?.map((d) => d.id)).toEqual(week.decisions.map((d) => d.id));
    const mine = x.decisionBlockers?.filter((d) => d.projectId === aProject).map((d) => d.description);
    // Critical counts at once; a fresh Low blocker isn't old enough yet — unless the list is
    // already full of older ones (it shows the six oldest).
    if (mine?.length) expect(mine).toEqual(["Fixture A critical blocker"]);
  });

  it("hides the blockers list from a viewer without reports:read", async () => {
    const x = await getPortfolioHomeExtras({ ...exec, roles: ["Member"], permissions: [] }, [aProject], now);
    expect(x.decisionBlockers).toBeNull();
  });

  it("RLS: never returns another tenant's blockers, milestones or check-in lines", async () => {
    const x = await getPortfolioHomeExtras(exec, [aProject, bProject], now);
    expect(x.nextMilestones[bProject]).toBeUndefined();
    expect(x.lastLine[bProject]).toBeUndefined();
    expect(x.decisionBlockers?.some((d) => d.projectId === bProject)).toBe(false);
    const y = await getPortfolioHomeExtras(bExec, [aProject, bProject], now);
    expect(y.nextMilestones[aProject]).toBeUndefined();
    expect(y.lastLine[bProject]?.line).toBe("Tenant B line");
    expect(y.decisionBlockers?.some((d) => d.projectId === aProject)).toBe(false);
  });
});

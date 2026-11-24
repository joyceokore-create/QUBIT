// UX9 (UX plan D13) — Reports › Quality. getQualityOverview counts a Riverbank project's open
// Critical bug + Critical issue (and buckets them in this week's "opened" count) and never
// counts Demo Org B's; the report behind the tab and the CSV route refuses anyone who isn't
// a Head of QA with reports:read. Requires a migrated, seeded DB. Synthetic data only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { isoWeekId } from "@/lib/iso-week";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getCockpitData } from "@/server/dashboard-cockpit";
import { getQualityOverview } from "@/server/quality";
import { getQualityReport, QualityReportError } from "@/server/quality-report";
import { cleanupFixtureUsers, createUsers } from "./_users";

async function seedProject(ctx: TenantContext, code: string, name: string): Promise<string> {
  return withTenant(ctx, async (tx) => {
    const p = await tx.project.create({
      data: { tenantId: ctx.tenantId, code, name, type: "Project", priority: "High", status: "OnTrack" },
      select: { id: true },
    });
    await tx.projectTask.create({
      data: { tenantId: ctx.tenantId, projectId: p.id, title: "Fixture critical bug", type: "Bug", severity: "Critical", status: "NotStarted", approvalStatus: "Published" },
    });
    // A High bug and a closed Critical bug: counted as High, and not at all, respectively.
    await tx.projectTask.create({
      data: { tenantId: ctx.tenantId, projectId: p.id, title: "Fixture high bug", type: "Bug", severity: "High", status: "InProgress", approvalStatus: "Published" },
    });
    await tx.projectTask.create({
      data: { tenantId: ctx.tenantId, projectId: p.id, title: "Fixture fixed critical bug", type: "Bug", severity: "Critical", status: "Completed", approvalStatus: "Published" },
    });
    await tx.issue.create({ data: { tenantId: ctx.tenantId, projectId: p.id, title: "Fixture critical issue", severity: "Critical", status: "Open" } });
    return p.id;
  });
}

const thisWeek = (weekly: { isoWeek: string; opened: number }[]) => weekly.find((w) => w.isoWeek === isoWeekId(new Date()))?.opened ?? 0;

describe("UX9 Reports › Quality", () => {
  let rbQa: TenantContext;
  let bQa: TenantContext;
  let rbProjectId: string;
  let bProjectId: string;
  let rbBaselineWeek = 0;

  beforeAll(async () => {
    const [rb, b] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !b) throw new Error("Seed required.");
    const [[rbUser], [bUser]] = await Promise.all([createUsers(rb.id, 1, "qrep"), createUsers(b.id, 1, "qrep")]);
    rbQa = { tenantId: rb.id, userId: rbUser.id, roles: ["HeadOfQA"] };
    bQa = { tenantId: b.id, userId: bUser.id, roles: ["HeadOfQA"] };

    // Riverbank's critical count this week BEFORE the fixtures, so the delta is exact.
    const before = await getQualityOverview(rbQa, (await getCockpitData(rbQa)).projects);
    rbBaselineWeek = thisWeek(before.weekly);

    const stamp = Date.now() % 100000;
    rbProjectId = await seedProject(rbQa, `QRA${stamp}`, "Quality fixture A");
    bProjectId = await seedProject(bQa, `QRB${stamp}`, "Quality fixture B");
  });

  afterAll(async () => {
    for (const [ctx, id] of [
      [rbQa, rbProjectId],
      [bQa, bProjectId],
    ] as const) {
      if (!ctx || !id) continue;
      await withTenant(ctx, async (tx) => {
        await tx.issue.deleteMany({ where: { projectId: id } });
        await tx.domainEvent.deleteMany({ where: { payload: { path: ["projectId"], equals: id } } });
        await tx.project.deleteMany({ where: { id } });
      });
    }
    if (rbQa) await cleanupFixtureUsers(rbQa.tenantId);
    if (bQa) await cleanupFixtureUsers(bQa.tenantId);
    await prisma.$disconnect();
  });

  it("counts a Riverbank project's open Critical bug + Critical issue, and buckets them in this week", async () => {
    const q = await getQualityOverview(rbQa, (await getCockpitData(rbQa)).projects);
    const p = q.projects.find((x) => x.id === rbProjectId);
    expect(p).toBeDefined();
    expect(p!.criticalOpen).toBe(2);
    expect(p!.openBugs).toEqual({ critical: 1, high: 1, medium: 0, low: 0 });
    expect(q.weekly).toHaveLength(8);
    // The closed Critical bug was still OPENED this week, so it counts in the trend: 3 opened.
    expect(thisWeek(q.weekly)).toBe(rbBaselineWeek + 3);
  });

  it("RLS: never counts Demo Org B's project, bugs or issues", async () => {
    const q = await getQualityOverview(rbQa, (await getCockpitData(rbQa)).projects);
    expect(q.projects.some((x) => x.id === bProjectId)).toBe(false);
    expect(q.critical.some((c) => c.projectId === bProjectId)).toBe(false);
    // Even fed B's project id directly, Riverbank's RLS context reads none of B's rows.
    const forged = await getQualityOverview(rbQa, [{ ...(await getCockpitData(bQa)).projects.find((x) => x.id === bProjectId)! }]);
    expect(forged.projects[0]!.criticalOpen).toBe(0);
    expect(forged.projects[0]!.openBugs).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
    expect(forged.weekly.reduce((s, w) => s + w.opened, 0)).toBe(0);
    // And B's own Head of QA sees B's project, not A's.
    const bq = await getQualityOverview(bQa, (await getCockpitData(bQa)).projects);
    expect(bq.projects.find((x) => x.id === bProjectId)?.criticalOpen).toBe(2);
    expect(bq.projects.some((x) => x.id === rbProjectId)).toBe(false);
  });

  it("the report (tab + CSV) carries the row, most critical first", async () => {
    const r = await getQualityReport(rbQa);
    const row = r.rows.find((x) => x.id === rbProjectId);
    expect(row).toMatchObject({ criticalOpen: 2, openBugs: { high: 1, medium: 0, low: 0 }, coveragePct: null });
    const crit = r.rows.map((x) => x.criticalOpen);
    expect(crit).toEqual([...crit].sort((a, b) => b - a));
    expect(r.rows.some((x) => x.id === bProjectId)).toBe(false);
  });

  it("refuses anyone without the Head-of-QA rule", async () => {
    for (const roles of [["Executive"], ["HeadOfProjects"], ["ProjectManager"], ["Member"], ["PlatformSuperAdmin"]]) {
      await expect(getQualityReport({ ...rbQa, roles })).rejects.toBeInstanceOf(QualityReportError);
    }
    // Head of QA whose tenant override removed reports:read.
    await expect(getQualityReport({ ...rbQa, permissions: ["dashboard:read"] })).rejects.toBeInstanceOf(QualityReportError);
  });
});

// M-W1c (docs/32) — the PM home's my-projects rows: Δ from snapshots, next milestone
// with the slipped flag, blocker counts, worst-first ordering, and "my" scoping.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getPmDashboard } from "@/server/dashboard-pm";
import { createUsers, cleanupFixtureUsers } from "./_users";

const NOW = new Date("2026-08-04T12:00:00.000Z");

describe("M-W1c PM home my-projects", () => {
  let rbId: string;
  let ctx: TenantContext;
  let pmId: string;
  let atRiskId: string;
  let onTrackId: string;
  let foreignId: string;

  beforeAll(async () => {
    const rb = await prisma.tenant.findUnique({ where: { slug: "riverbank" } });
    if (!rb) throw new Error("Seed required.");
    rbId = rb.id;
    const [pm] = await createUsers(rbId, 1, "pmh");
    pmId = pm.id;
    ctx = { tenantId: rbId, userId: pmId, roles: ["ProjectManager"] };

    await withTenant(ctx, async (tx) => {
      const mk = (code: string, status: string, lead: boolean) =>
        tx.project.create({
          data: {
            tenantId: rbId,
            code,
            name: `pmh ${code}`,
            type: "Project",
            priority: "Med",
            status,
            leadUserId: lead ? pmId : null,
          },
          select: { id: true },
        });
      atRiskId = (await mk("PMH1", "AtRisk", true)).id;
      onTrackId = (await mk("PMH2", "OnTrack", true)).id;
      foreignId = (await mk("PMH3", "OnTrack", false)).id; // not mine

      // Δ source: a snapshot 7 days back at 30% for the at-risk project; live progress
      // comes from org statuses (55% → Δ +25).
      await tx.projectOrgStatus.create({
        data: { tenantId: rbId, projectId: atRiskId, orgUnitId: (await tx.orgUnit.findFirstOrThrow({ select: { id: true } })).id, progress: 55, status: "AtRisk" },
      });
      await tx.projectSnapshot.create({
        data: {
          tenantId: rbId,
          projectId: atRiskId,
          day: new Date(NOW.getTime() - 7 * 86_400_000),
          status: "AtRisk",
          rag: "Amber",
          progress: 30,
          tasksOpen: 0,
          tasksCompleted: 0,
          tasksOverdue: 0,
          blockersOpen: 0,
          risksOpen: 0,
        },
      });
      // A slipped milestone + an open blocker on the at-risk project.
      await tx.projectMilestone.create({
        data: { tenantId: rbId, projectId: atRiskId, name: "UAT", status: "Pending", dueDate: new Date(NOW.getTime() - 2 * 86_400_000) },
      });
      await tx.blocker.create({
        data: { tenantId: rbId, projectId: atRiskId, description: "pmh blocker", severity: "High", status: "Open", dateRaised: NOW },
      });
    });
  });

  afterAll(async () => {
    await withTenant(ctx, async (tx) => {
      await tx.blocker.deleteMany({ where: { description: "pmh blocker" } });
      await tx.projectMilestone.deleteMany({ where: { name: "UAT", projectId: atRiskId } });
      await tx.projectSnapshot.deleteMany({ where: { projectId: atRiskId } });
      await tx.projectOrgStatus.deleteMany({ where: { projectId: { in: [atRiskId, onTrackId, foreignId] } } });
      await tx.project.deleteMany({ where: { code: { in: ["PMH1", "PMH2", "PMH3"] } } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("assembles my rows only, worst first, with Δ · milestone · blockers", async () => {
    const d = await getPmDashboard(ctx, NOW);
    const codes = d.myProjects.map((r) => r.code);
    expect(codes).toContain("PMH1");
    expect(codes).toContain("PMH2");
    expect(codes).not.toContain("PMH3"); // not mine — scoping, not visibility (DM1.20)

    // Worst first: AtRisk before OnTrack.
    expect(codes.indexOf("PMH1")).toBeLessThan(codes.indexOf("PMH2"));

    const row = d.myProjects.find((r) => r.code === "PMH1")!;
    expect(row.progress).toBe(55);
    expect(row.deltaPct).toBe(25); // 55 now vs 30 a week ago
    expect(row.nextMilestone?.name).toBe("UAT");
    expect(row.nextMilestone?.overdue).toBe(true);
    expect(row.openBlockers).toBe(1);

    // No snapshot history → Δ is null, never invented.
    const fresh = d.myProjects.find((r) => r.code === "PMH2")!;
    expect(fresh.deltaPct).toBeNull();
  });
});

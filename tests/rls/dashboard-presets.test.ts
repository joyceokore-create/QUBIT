// M1b presets (docs/17 §3/§4): the developer preset answers "what do I work on right
// now?" from the viewer's own tasks; the PM preset scopes to led/managed projects by
// default (a filter, never a wall — DM1.20) and queues what's stuck on the PM.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getDevDashboard } from "@/server/dashboard-dev";
import { getPmDashboard } from "@/server/dashboard-pm";
import { getPortfolioSections, type PortfolioSectionsData } from "@/server/pipeline";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

// Amended docs/18 §6: presets consume portfolio-grouped sections; each section body is
// the stage-grouped pipeline. Flatten across sections when a test cares about rows.
const allRows = (s: PortfolioSectionsData) => s.sections.flatMap((sec) => sec.pipeline.groups.flatMap((g) => g.rows));

const day = 86_400_000;

describe("M1b dashboard presets", () => {
  let demoBId: string;
  let pmId: string;
  let devId: string;
  let projectId: string;
  let overdueTaskId: string;
  let devCtx: TenantContext;
  let pmCtx: TenantContext;

  beforeAll(async () => {
    const demoB = await prisma.tenant.findUnique({ where: { slug: "demo-b" } });
    if (!demoB) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    demoBId = demoB.id;
    const [pm, dev] = await ensureUsers(demoBId, 2);
    pmId = pm.id;
    devId = dev.id;
    pmCtx = { tenantId: demoBId, userId: pmId, roles: ["Member"] };
    devCtx = { tenantId: demoBId, userId: devId, roles: ["Member"] };

    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      const now = Date.now();
      const project = await tx.project.create({
        data: {
          tenantId: demoBId,
          code: `PRE${now % 100000}`,
          name: "Preset Fixture",
          type: "Project",
          priority: "High",
          status: "AtRisk",
          leadUserId: pmId,
        },
      });
      projectId = project.id;
      await tx.projectMember.create({ data: { tenantId: demoBId, projectId, userId: devId, role: "Developer" } });

      const overdue = await tx.projectTask.create({
        data: { tenantId: demoBId, projectId, title: "Fix export race", status: "InProgress", approvalStatus: "Published", assigneeId: devId, dueDate: new Date(now - 3 * day), lastActivityAt: new Date(now) },
      });
      overdueTaskId = overdue.id;
      const blockedTask = await tx.projectTask.create({
        data: { tenantId: demoBId, projectId, title: "Blocked migration", status: "InProgress", approvalStatus: "Published", assigneeId: devId, dueDate: new Date(now - 6 * day), lastActivityAt: new Date(now) },
      });
      await tx.blocker.create({
        data: { tenantId: demoBId, projectId, taskId: blockedTask.id, description: "Waiting on DBA window", severity: "Medium", status: "Open", createdAt: new Date(now - 4 * day) },
      });
      await tx.projectTask.create({
        data: { tenantId: demoBId, projectId, title: "Ship burndown widget", status: "Completed", approvalStatus: "Published", assigneeId: devId, lastActivityAt: new Date(now), updatedAt: new Date(now) },
      });
      await tx.projectTask.create({
        data: { tenantId: demoBId, projectId, title: "AI draft idea", status: "NotStarted", approvalStatus: "Draft", createdAt: new Date(now - 3 * day) },
      });
      await tx.projectMilestone.create({
        data: { tenantId: demoBId, projectId, name: "Pilot go-live", status: "Pending", dueDate: new Date(now + 10 * day) },
      });
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      await tx.project.deleteMany({ where: { id: projectId } }); // tasks/members/milestones cascade
    });
    await cleanupFixtureUsers(demoBId);
    await prisma.$disconnect();
  });

  it("developer: focus is the overdue unblocked task, buckets split correctly", async () => {
    const d = await getDevDashboard(devCtx);
    expect(d.focus?.id).toBe(overdueTaskId); // the blocked one is MORE overdue but not actionable
    expect(d.focusReason).toContain("overdue");
    expect(d.buckets.overdue.map((t) => t.title)).toContain("Fix export race");
    expect(d.buckets.blocked).toHaveLength(1);
    expect(d.buckets.blocked[0].blockedReason).toBe("Waiting on DBA window");
    expect(d.doneThisWeek.map((t) => t.title)).toContain("Ship burndown widget");
  });

  it("portfolio sections (docs/18 §1/§6): stage grouping, derived chips, unconfirmed flag", async () => {
    const p = await getPortfolioSections(pmCtx);
    const row = allRows(p).find((r) => r.id === projectId)!;
    expect(row.isMine).toBe(true);
    expect(row.chips.health).toBe("Amber"); // AtRisk via the one health engine
    expect(row.unconfirmed).toBe(true); // no check-in confirmed this week
    expect(row.chips.risksOpen).toBe(0);
    expect(row.chips.velocity7d).toBe(1); // "Ship burndown widget" completed this week
    expect(row.chips.resources).toBe(1); // the dev membership
    // Raw fixture insert has no portfolio — it folds into Unassigned, never vanishes.
    const home = p.sections.find((s) => s.pipeline.groups.some((g) => g.rows.some((r) => r.id === projectId)))!;
    expect(home.isUnassigned).toBe(true);
    // The fixture project defaulted to Exploring — it sits in that stage group.
    expect(home.pipeline.groups.find((g) => g.stage === "Exploring")!.rows.map((r) => r.id)).toContain(projectId);
    // Every row lands in exactly one section + stage group.
    const allIds = allRows(p).map((r) => r.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(p.total).toBe(allIds.length);
  });

  it("PM: the action queue holds what's stuck on ME — drafts, aged blocker, slipping tasks", async () => {
    const d = await getPmDashboard(pmCtx);
    const kinds = d.actionQueue.map((r) => r.kind);
    expect(kinds).toContain("drafts");
    expect(kinds).toContain("blocker");
    expect(kinds).toContain("slipping");
    // Scope to THIS suite's own blocker. Taking the first "blocker" row asserted against
    // whatever the seed happens to rank highest, so the test failed for reasons that had
    // nothing to do with the code under test.
    const blockerRows = d.actionQueue.filter((r) => r.kind === "blocker");
    expect(blockerRows.some((r) => r.title.includes("Waiting on DBA window"))).toBe(true);
  });

  it("PM: scope is a default filter, never a wall (DM1.20)", async () => {
    const [d, p] = await Promise.all([getPmDashboard(pmCtx), getPortfolioSections(pmCtx)]);
    expect(p.mineCount).toBeGreaterThanOrEqual(1);
    expect(p.total).toBeGreaterThan(p.mineCount); // seeded projects visible on the ALL side
    expect(d.myProjectCount).toBe(p.mineCount);
  });

  it("PM: team load lists only members of MY projects", async () => {
    const d = await getPmDashboard(pmCtx);
    expect(d.teamLoad.map((m) => m.userId)).toContain(devId);
    // Every listed member must actually share one of MY projects (the fixture PM may
    // also run seeded demo projects with their own members — that's legitimate).
    const myMembers = await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      const mine = await tx.project.findMany({
        where: { OR: [{ leadUserId: pmId }, { members: { some: { userId: pmId, role: "Project Manager" } } }] },
        select: { id: true },
      });
      const members = await tx.projectMember.findMany({
        where: { projectId: { in: mine.map((p) => p.id) } },
        select: { userId: true },
      });
      return new Set(members.map((m) => m.userId));
    });
    for (const member of d.teamLoad) {
      expect(myMembers.has(member.userId)).toBe(true);
    }
  });

  it("developer data is tenant-scoped and personal", async () => {
    const stranger = { tenantId: demoBId, userId: "00000000-0000-0000-0000-000000000000", roles: ["Member"] };
    const d = await getDevDashboard(stranger);
    expect(d.focus).toBeNull();
    expect(d.buckets.overdue).toHaveLength(0);
  });
});

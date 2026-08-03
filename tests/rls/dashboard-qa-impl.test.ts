// M1c presets (docs/17 §5/§7): the QA dashboard answers "what's ready for me to test,
// and which of my bugs are stuck?" from the viewer's own projects; the Implementor
// dashboard answers "what goes live next, and is it ready?" from the interim
// UAT/pilot-milestone source. Both are viewer-scoped and tenant-isolated.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getQaDashboard } from "@/server/dashboard-qa";
import { getImplDashboard } from "@/server/dashboard-impl";
import { setTaskStatus } from "@/server/project-tasks";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

const day = 86_400_000;

describe("M1c QA + Implementor dashboards", () => {
  let demoBId: string;
  let qaId: string;
  let devId: string;
  let projectId: string;
  let criticalBugId: string;
  let raisedBugId: string;
  let qaCtx: TenantContext;

  beforeAll(async () => {
    const demoB = await prisma.tenant.findUnique({ where: { slug: "demo-b" } });
    if (!demoB) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    demoBId = demoB.id;
    const [qa, dev] = await ensureUsers(demoBId, 2);
    qaId = qa.id;
    devId = dev.id;
    qaCtx = { tenantId: demoBId, userId: qaId, roles: ["Member"] };

    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      const now = Date.now();
      const project = await tx.project.create({
        data: {
          tenantId: demoBId,
          code: `QAI${now % 100000}`,
          name: "QA/Impl Fixture",
          type: "Project",
          priority: "High",
          status: "AtRisk",
        },
      });
      projectId = project.id;
      await tx.projectMember.create({ data: { tenantId: demoBId, projectId, userId: qaId, role: "QA Engineer" } });

      // Verification work: one InQA feature that has sat 10 business days (aging=bad).
      await tx.projectTask.create({
        data: {
          tenantId: demoBId, projectId, title: "Verify e2e export flow", type: "Feature",
          status: "InQA", approvalStatus: "Published", lastActivityAt: new Date(now - 14 * day),
        },
      });
      // Triage: an unassigned CRITICAL bug — pinned first, never in the project groups.
      const crit = await tx.projectTask.create({
        data: {
          tenantId: demoBId, projectId, title: "Login loop on TOTP retry", type: "Bug",
          severity: "Critical", status: "NotStarted", approvalStatus: "Published",
          lastActivityAt: new Date(now),
        },
      });
      criticalBugId = crit.id;
      // A bug the QA fixture raised, being fixed by dev — the "Bugs I raised" panel.
      const raised = await tx.projectTask.create({
        data: {
          tenantId: demoBId, projectId, title: "Totals drift on paginated audit view", type: "Bug",
          severity: "High", status: "InProgress", approvalStatus: "Published",
          reporterId: qaId, assigneeId: devId, lastActivityAt: new Date(now),
        },
      });
      raisedBugId = raised.id;

      // Implementor interim source: UAT/pilot-tagged milestones + a pending-review doc.
      await tx.projectMilestone.createMany({
        data: [
          { tenantId: demoBId, projectId, name: "SIT complete", status: "Done", orderIndex: 0 },
          { tenantId: demoBId, projectId, name: "UAT sign-off", status: "Pending", dueDate: new Date(now + 5 * day), orderIndex: 1 },
          { tenantId: demoBId, projectId, name: "Go-live pilot", status: "Pending", dueDate: new Date(now + 12 * day), orderIndex: 2 },
        ],
      });
      await tx.blocker.create({
        data: { tenantId: demoBId, projectId, description: "Telco API docs outstanding", severity: "Critical", status: "Open" },
      });
      await tx.projectDocument.create({
        data: { tenantId: demoBId, projectId, title: "Handover pack", kind: "Handover", status: "InReview" },
      });
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      await tx.domainEvent.deleteMany({ where: { payload: { path: ["projectId"], equals: projectId } } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(demoBId);
    await prisma.$disconnect();
  });

  it("QA: hero counts, triage holds ONLY unassigned critical bugs, aging uses business days", async () => {
    const d = await getQaDashboard(qaCtx);
    expect(d.triage.map((t) => t.id)).toContain(criticalBugId);
    expect(d.hero.criticalUnassigned).toBeGreaterThanOrEqual(1);
    // Triage rows never repeat inside the per-project groups.
    const groupIds = d.queue.flatMap((g) => g.items.map((i) => i.id));
    expect(groupIds).not.toContain(criticalBugId);
    // The 14-calendar-day-old InQA item crossed the 5-business-day line.
    const fixtureGroup = d.queue.find((g) => g.projectId === projectId)!;
    const aged = fixtureGroup.items.find((i) => i.title === "Verify e2e export flow")!;
    expect(aged.aging).toBe("bad");
    expect(aged.ageBusinessDays).toBeGreaterThan(5);
    expect(d.hero.agingOverThreshold).toBeGreaterThanOrEqual(1);
  });

  it("QA: bugs I raised carries severity/status, and a Completed→reopened bug is flagged", async () => {
    let d = await getQaDashboard(qaCtx);
    let raised = d.bugsRaised.find((b) => b.id === raisedBugId)!;
    expect(raised.severity).toBe("High");
    expect(raised.reopened).toBe(false);

    // Complete it as QA (QA owns Completed for bugs, docs/18 §4), then reopen it.
    await setTaskStatus(qaCtx, raisedBugId, "Completed");
    await setTaskStatus(qaCtx, raisedBugId, "InProgress");

    d = await getQaDashboard(qaCtx);
    raised = d.bugsRaised.find((b) => b.id === raisedBugId)!;
    expect(raised.reopened).toBe(true);
    // The reopen shows up in the project quality strip's rate too.
    const quality = d.quality.find((q) => q.projectId === projectId)!;
    expect(quality.reopenRatePct).toBe(100); // 1 reopened of 1 ever-completed
    expect(quality.bySeverity.critical).toBeGreaterThanOrEqual(1);
  });

  it("QA: scoped to MY projects — a non-member sees none of the fixture work", async () => {
    const stranger = { tenantId: demoBId, userId: "00000000-0000-0000-0000-000000000000", roles: ["Member"] };
    const d = await getQaDashboard(stranger);
    expect(d.queue.map((g) => g.projectId)).not.toContain(projectId);
    expect(d.triage.map((t) => t.id)).not.toContain(criticalBugId);
  });

  it("Implementor: interim rollout window from UAT/pilot milestones — gates, next go-live, issues, docs", async () => {
    const d = await getImplDashboard(qaCtx); // the fixture user is a member — same scoping path
    const pilot = d.pilots.find((p) => p.projectId === projectId)!;
    expect(pilot.stage).toBe("UAT"); // pending UAT milestone outranks pilot naming
    expect(pilot.gatesTotal).toBe(3);
    expect(pilot.gatesDone).toBe(1); // SIT complete
    expect(pilot.hasLateGate).toBe(false);

    expect(d.nextGoLive).not.toBeNull();
    expect(d.nextGoLive!.milestoneName).toBe("UAT sign-off");
    expect(d.nextGoLive!.daysUntil).toBeGreaterThan(0);

    expect(d.issues.some((i) => i.description === "Telco API docs outstanding" && i.severity === "Critical")).toBe(true);
    expect(d.calendar.map((c) => c.label)).toContain("Go-live pilot");
    expect(d.handoverDocs.some((doc) => doc.title === "Handover pack")).toBe(true);
    // No checkpoint template on this fixture — the row says it fell back to milestones.
    expect(pilot.gateSource).toBe("milestones");
  });

  it("M8: with a checkpoint template attached, the gates come from the template", async () => {
    const template = await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      const tmpl = await tx.checkpointTemplate.findFirstOrThrow({
        where: { name: "Product build" },
        select: { id: true, checkpoints: { select: { id: true }, orderBy: { orderIndex: "asc" } } },
      });
      await tx.project.update({ where: { id: projectId }, data: { checkpointTemplateId: tmpl.id } });
      // Close the first two gates and block the third.
      await tx.checkpointStatus.createMany({
        data: [
          { tenantId: demoBId, projectId, checkpointId: tmpl.checkpoints[0].id, state: "Done" },
          { tenantId: demoBId, projectId, checkpointId: tmpl.checkpoints[1].id, state: "Done" },
          { tenantId: demoBId, projectId, checkpointId: tmpl.checkpoints[2].id, state: "Blocked" },
        ],
      });
      return tmpl;
    });

    const d = await getImplDashboard(qaCtx);
    const pilot = d.pilots.find((p) => p.projectId === projectId)!;
    expect(pilot.gateSource).toBe("checkpoints");
    expect(pilot.gatesTotal).toBe(template.checkpoints.length); // 6, not the 3 milestones
    expect(pilot.gatesDone).toBe(2);
    expect(pilot.hasLateGate).toBe(true); // a Blocked gate is the "late" signal
    // The hero's open-gate list is the template's own, in order.
    expect(d.nextGoLive!.gatesTotal).toBe(template.checkpoints.length);
    expect(d.nextGoLive!.openGates[0].name).toBe("MVP1");
    expect(d.nextGoLive!.openGates[0].late).toBe(true);
  });

  it("RLS: tenant B sees none of tenant A's QA or rollout data", async () => {
    const riverbank = await prisma.tenant.findUniqueOrThrow({ where: { slug: "riverbank" } });
    const [rvUser] = await ensureUsers(riverbank.id, 1);
    const rvCtx = { tenantId: riverbank.id, userId: rvUser.id, roles: ["Member"] };
    const [qa, impl] = await Promise.all([getQaDashboard(rvCtx), getImplDashboard(rvCtx)]);
    expect(qa.queue.map((g) => g.projectId)).not.toContain(projectId);
    expect(qa.triage.map((t) => t.id)).not.toContain(criticalBugId);
    expect(impl.pilots.map((p) => p.projectId)).not.toContain(projectId);
    expect(impl.handoverDocs.map((doc) => doc.projectId)).not.toContain(projectId);
    await cleanupFixtureUsers(riverbank.id);
  });
});

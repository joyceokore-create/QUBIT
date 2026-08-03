// M18-A personal board rules (docs/18 §4): completion by task type (QA owns Completed
// for Feature/Bug; ad-hoc types complete directly), reporter notifications on lane
// moves, and "added by" attribution.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { listMyTasks, setTaskStatus, TaskError } from "@/server/project-tasks";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

describe("M18-A board rules", () => {
  let demoBId: string;
  let reporterId: string;
  let devId: string;
  let qaId: string;
  let projectId: string;
  let featureId: string;
  let choreId: string;
  let devCtx: TenantContext;
  let qaCtx: TenantContext;

  beforeAll(async () => {
    const demoB = await prisma.tenant.findUnique({ where: { slug: "demo-b" } });
    if (!demoB) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    demoBId = demoB.id;
    const [reporter, dev, qa] = await ensureUsers(demoBId, 3);
    reporterId = reporter.id;
    devId = dev.id;
    qaId = qa.id;
    devCtx = { tenantId: demoBId, userId: devId, roles: ["Member"] };
    qaCtx = { tenantId: demoBId, userId: qaId, roles: ["Member"] };

    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      const project = await tx.project.create({
        data: { tenantId: demoBId, code: `BRD${Date.now() % 100000}`, name: "Board Rules Fixture", type: "Project", priority: "High", status: "OnTrack" },
      });
      projectId = project.id;
      await tx.projectMember.createMany({
        data: [
          { tenantId: demoBId, projectId, userId: devId, role: "Developer" },
          { tenantId: demoBId, projectId, userId: qaId, role: "QA Engineer" },
        ],
      });
      const feature = await tx.projectTask.create({
        data: { tenantId: demoBId, projectId, title: "Build the export flow", type: "Feature", status: "InProgress", approvalStatus: "Published", assigneeId: devId, reporterId, lastActivityAt: new Date() },
      });
      featureId = feature.id;
      const chore = await tx.projectTask.create({
        data: { tenantId: demoBId, projectId, title: "Rotate the API keys", type: "Chore", status: "InProgress", approvalStatus: "Published", assigneeId: devId, reporterId, lastActivityAt: new Date() },
      });
      choreId = chore.id;
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      await tx.notification.deleteMany({ where: { kind: "task_update" } });
      await tx.domainEvent.deleteMany({ where: { type: { in: ["task.status_changed", "task.completed"] } } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(demoBId);
    await prisma.$disconnect();
  });

  it("attributes assigned tasks: 'added by <reporter>' on the assignee's board", async () => {
    const mine = await listMyTasks(devCtx, devId);
    const feature = mine.find((t) => t.id === featureId)!;
    expect(feature.addedBy).toBeTruthy(); // the reporter, not the assignee
    expect(feature.type).toBe("Feature");
  });

  it("a lane move notifies the reporter — never the mover", async () => {
    await setTaskStatus(devCtx, featureId, "InReview");
    const note = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.notification.findFirst({ where: { userId: reporterId, kind: "task_update" } }),
    );
    expect(note?.message).toContain("moved to InReview");
    const selfNote = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.notification.findFirst({ where: { userId: devId, kind: "task_update" } }),
    );
    expect(selfNote).toBeNull();
  });

  it("QA owns Completed for features: the assignee is refused, QA passes it", async () => {
    await expect(setTaskStatus(devCtx, featureId, "Completed")).rejects.toThrow(TaskError);
    await expect(setTaskStatus(devCtx, featureId, "Completed")).rejects.toThrow(/QA owns Completed/);

    // The QA-category member completes it.
    await setTaskStatus(qaCtx, featureId, "Completed");
    const row = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.projectTask.findUniqueOrThrow({ where: { id: featureId }, select: { status: true } }),
    );
    expect(row.status).toBe("Completed");
  });

  it("ad-hoc types (Chore) complete directly by the assignee", async () => {
    await setTaskStatus(devCtx, choreId, "Completed");
    const row = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.projectTask.findUniqueOrThrow({ where: { id: choreId }, select: { status: true } }),
    );
    expect(row.status).toBe("Completed");
  });

  it("HeadOfQA may complete features anywhere", async () => {
    const extra = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.projectTask.create({
        data: { tenantId: demoBId, projectId, title: "Fix regression", type: "Bug", severity: "High", status: "InQA", approvalStatus: "Published", assigneeId: devId, reporterId, lastActivityAt: new Date() },
      }),
    );
    const headCtx = { tenantId: demoBId, userId: reporterId, roles: ["HeadOfQA"] };
    await setTaskStatus(headCtx, extra.id, "Completed");
    const row = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.projectTask.findUniqueOrThrow({ where: { id: extra.id }, select: { status: true } }),
    );
    expect(row.status).toBe("Completed");
  });
});

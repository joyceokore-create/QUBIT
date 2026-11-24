// Tier 3 — Member lenses on My Work: the lens follows the project role, and the Implementor
// lens's go-lives / rollout issues / handover documents never cross tenants. Requires a
// migrated, seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getImplementorLens, getMyWork } from "@/server/my-work";
import { cleanupFixtureUsers, createUsers } from "./_users";

describe("Tier 3 Member lenses", () => {
  let rbId: string;
  let bId: string;
  let impl: TenantContext; // Riverbank, Implementation Lead on project A
  let qa: TenantContext; // Riverbank, QA Engineer on project A
  let dev: TenantContext; // Riverbank, Developer on project A
  let bImpl: TenantContext; // Demo Org B, Implementation Lead on project B
  let projectId: string;
  let bProjectId: string;
  const now = new Date();
  const day = 86_400_000;

  beforeAll(async () => {
    const [rb, b] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !b) throw new Error("Seed required.");
    rbId = rb.id;
    bId = b.id;
    const [[i, q, d], [bi]] = await Promise.all([createUsers(rbId, 3, "lens"), createUsers(bId, 1, "lens")]);
    impl = { tenantId: rbId, userId: i.id, roles: ["Member"] };
    qa = { tenantId: rbId, userId: q.id, roles: ["Member"] };
    dev = { tenantId: rbId, userId: d.id, roles: ["Member"] };
    bImpl = { tenantId: bId, userId: bi.id, roles: ["Member"] };

    const seedProject = async (ctx: TenantContext, code: string, label: string, people: { userId: string; role: string }[]) =>
      withTenant(ctx, async (tx) => {
        const p = await tx.project.create({ data: { tenantId: ctx.tenantId, code, name: `Lens fixture ${label}`, type: "Project", priority: "Med", status: "OnTrack" }, select: { id: true } });
        await tx.projectMember.createMany({ data: people.map((m) => ({ tenantId: ctx.tenantId, projectId: p.id, ...m })) });
        await tx.projectMilestone.createMany({
          data: [
            { tenantId: ctx.tenantId, projectId: p.id, name: `Go-live ${label}`, dueDate: new Date(now.getTime() + 3 * day) },
            { tenantId: ctx.tenantId, projectId: p.id, name: `SIT exit ${label}`, dueDate: new Date(now.getTime() + day) },
            { tenantId: ctx.tenantId, projectId: p.id, name: `Done go-live ${label}`, status: "Done" },
          ],
        });
        await tx.issue.createMany({
          data: [
            { tenantId: ctx.tenantId, projectId: p.id, title: `Rollout issue ${label}`, severity: "High", status: "Open", ownerId: people[0].userId },
            { tenantId: ctx.tenantId, projectId: p.id, title: `Closed issue ${label}`, severity: "Low", status: "Closed" },
          ],
        });
        await tx.projectDocument.createMany({
          data: [
            { tenantId: ctx.tenantId, projectId: p.id, title: `Handover pack ${label}`, kind: "Handover", status: "InReview", createdById: people[0].userId },
            { tenantId: ctx.tenantId, projectId: p.id, title: `Approved handover ${label}`, kind: "Handover", status: "Approved" },
            { tenantId: ctx.tenantId, projectId: p.id, title: `Design ${label}`, kind: "Design", status: "Draft" },
          ],
        });
        return p.id;
      });

    projectId = await seedProject(impl, "LENSA1", "A", [
      { userId: i.id, role: "Implementation Lead" },
      { userId: q.id, role: "QA Engineer" },
      { userId: d.id, role: "Developer" },
    ]);
    await withTenant(qa, (tx) =>
      tx.projectTask.createMany({
        data: [
          { tenantId: rbId, projectId, title: "Fixture fixed bug", type: "Bug", status: "InQA", reporterId: q.id, assigneeId: d.id, dueDate: new Date(now.getTime() + day) },
          // Unassigned bugs I raised still count as mine (regression: NOT { assigneeId } dropped NULLs).
          { tenantId: rbId, projectId, title: "Fixture unassigned bug", type: "Bug", status: "NotStarted", reporterId: q.id, dueDate: new Date(now.getTime() + 2 * day) },
        ],
      }),
    );
    bProjectId = await seedProject(bImpl, "LENSB1", "B", [{ userId: bi.id, role: "Implementation Lead" }]);
  });

  afterAll(async () => {
    await withTenant(impl, async (tx) => {
      await tx.issue.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await withTenant(bImpl, async (tx) => {
      await tx.issue.deleteMany({ where: { projectId: bProjectId } });
      await tx.project.deleteMany({ where: { id: bProjectId } });
    });
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  it("picks the lens from the project role", async () => {
    const [d, q, i] = await Promise.all([getMyWork(dev, now), getMyWork(qa, now), getMyWork(impl, now)]);
    expect(d.lens).toBe("developer");
    expect(d.implementor).toBeNull();
    expect(q.lens).toBe("qa");
    expect(q.raised.map((t) => [t.title, t.status]).sort()).toEqual([
      ["Fixture fixed bug", "InQA"],
      ["Fixture unassigned bug", "NotStarted"],
    ]);
    expect(i.lens).toBe("implementor");
  });

  it("Implementor lens: pending go-lives, open issues and unapproved handovers on my projects", async () => {
    const { implementor } = await getMyWork(impl, now);
    expect(implementor?.goLives.map((g) => g.milestoneName)).toEqual(["Go-live A"]);
    expect(implementor?.issues.map((x) => [x.title, x.mine])).toEqual([["Rollout issue A", true]]);
    expect(implementor?.handovers.map((x) => [x.title, x.mine])).toEqual([["Handover pack A", true]]);
  });

  it("RLS: tenant B's rows never appear, even when asked for by id or with a spoofed user", async () => {
    // Riverbank context asking for tenant B's project id directly.
    expect(await getImplementorLens(impl, [bProjectId, projectId]).then((r) => [r.goLives, r.issues, r.handovers].flat().map((x) => x.projectId))).toEqual([projectId, projectId, projectId]);
    // Tenant B context with the Riverbank user's id and project id.
    const spoofed = await getImplementorLens({ ...bImpl, userId: impl.userId }, [projectId]);
    expect(spoofed).toEqual({ goLives: [], issues: [], handovers: [] });
    const bWork = await getMyWork({ ...bImpl, userId: impl.userId }, now);
    expect(bWork.lens).toBe("developer");
    expect(bWork.implementor).toBeNull();
    // And tenant B's own implementor sees only tenant B's rows.
    const own = await getMyWork(bImpl, now);
    expect(own.implementor?.goLives.map((g) => g.milestoneName)).toEqual(["Go-live B"]);
    expect(own.implementor?.issues.map((x) => x.title)).toEqual(["Rollout issue B"]);
    expect(own.implementor?.handovers.map((x) => x.title)).toEqual(["Handover pack B"]);
  });
});

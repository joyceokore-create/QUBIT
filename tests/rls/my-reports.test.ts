// UX6 (UX plan D13) — Member reports: the "My …" Custom report datasets. Requires a
// migrated, seeded DB. Synthetic fixture users and projects only; cleaned up afterwards.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { MY_DATASET_KEYS, REPORT_DATASETS } from "@/lib/report-catalogue";
import { allowedDatasetKeys, offeredDatasetKeys, runCustomReport } from "@/server/custom-reports";
import { buildExport } from "@/server/pdf/export";
import { cleanupFixtureUsers, createUsers } from "./_users";

const stamp = Date.now().toString(36).slice(-5).toUpperCase();
const P = (s: string) => `MR${s}${stamp}`; // project codes unique per run

describe("UX6 My reports datasets", () => {
  let rbId: string;
  let bId: string;
  let me: TenantContext; // Riverbank Member
  let other: TenantContext; // another Riverbank Member, same tenant
  let bMember: TenantContext; // Demo Org B Member
  const projectIds: { tenantId: string; id: string }[] = [];

  beforeAll(async () => {
    const [rb, b] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !b) throw new Error("Seed required — run `pnpm prisma db seed` first.");
    rbId = rb.id;
    bId = b.id;
    const [[a, o], [c]] = await Promise.all([createUsers(rbId, 2, "myr"), createUsers(bId, 1, "myr")]);
    me = { tenantId: rbId, userId: a.id, roles: ["Member"] };
    other = { tenantId: rbId, userId: o.id, roles: ["Member"] };
    bMember = { tenantId: bId, userId: c.id, roles: ["Member"] };

    const sys = { tenantId: rbId, userId: "seed" };
    await withTenant(sys, async (tx) => {
      const base = { tenantId: rbId, type: "Project", priority: "Med", status: "OnTrack" } as const;
      // P1: I'm a Developer; the other user leads. P2: the other user's only. P3: I lead.
      const p1 = await tx.project.create({ data: { ...base, code: P("1"), name: `My reports P1 ${stamp}`, leadUserId: o.id }, select: { id: true } });
      const p2 = await tx.project.create({ data: { ...base, code: P("2"), name: `My reports P2 ${stamp}`, leadUserId: o.id }, select: { id: true } });
      const p3 = await tx.project.create({ data: { ...base, code: P("3"), name: `My reports P3 ${stamp}`, leadUserId: a.id }, select: { id: true } });
      projectIds.push({ tenantId: rbId, id: p1.id }, { tenantId: rbId, id: p2.id }, { tenantId: rbId, id: p3.id });
      await tx.projectMember.createMany({
        data: [
          { tenantId: rbId, projectId: p1.id, userId: a.id, role: "Developer" },
          { tenantId: rbId, projectId: p1.id, userId: o.id, role: "Project Lead" },
          { tenantId: rbId, projectId: p2.id, userId: o.id, role: "Project Lead" },
        ],
      });
      const task = (projectId: string, title: string, assigneeId: string, extra: { status?: string; approvalStatus?: string } = {}) =>
        tx.projectTask.create({
          data: { tenantId: rbId, projectId, title, type: "Feature", status: extra.status ?? "InProgress", approvalStatus: extra.approvalStatus ?? "Published", assigneeId, lastActivityAt: new Date() },
          select: { id: true },
        });
      const mineOpen = await task(p1.id, `MR mine open ${stamp}`, a.id);
      await task(p1.id, `MR mine done ${stamp}`, a.id, { status: "Completed" });
      await task(p1.id, `MR mine draft ${stamp}`, a.id, { approvalStatus: "Draft" });
      await task(p3.id, `MR mine on p3 ${stamp}`, a.id, { status: "NotStarted" });
      const theirs = await task(p2.id, `MR theirs ${stamp}`, o.id);

      const blocker = (projectId: string, description: string, f: { raisedById?: string | null; ownerId?: string | null; taskId?: string | null }) =>
        tx.blocker.create({ data: { tenantId: rbId, projectId, description, severity: "Medium", status: "Open", raisedById: f.raisedById ?? null, ownerId: f.ownerId ?? null, taskId: f.taskId ?? null } });
      // Counted for me:
      await blocker(p2.id, `MRB raised by me ${stamp}`, { raisedById: a.id, ownerId: o.id, taskId: theirs.id });
      await blocker(p1.id, `MRB legacy own task ${stamp}`, { ownerId: a.id, taskId: mineOpen.id }); // pre-UX6 fallback
      // NOT counted for me:
      await blocker(p2.id, `MRB legacy owned, their task ${stamp}`, { ownerId: a.id, taskId: theirs.id });
      await blocker(p1.id, `MRB legacy owned, no task ${stamp}`, { ownerId: a.id });
      await blocker(p1.id, `MRB raised by other at me ${stamp}`, { raisedById: o.id, ownerId: a.id, taskId: mineOpen.id });
      await blocker(p2.id, `MRB the other's ${stamp}`, { raisedById: o.id, ownerId: o.id, taskId: theirs.id });
    });

    // Demo Org B: the same shapes for its own Member, which must never cross over.
    await withTenant({ tenantId: bId, userId: "seed" }, async (tx) => {
      const pb = await tx.project.create({
        data: { tenantId: bId, code: P("B"), name: `My reports PB ${stamp}`, type: "Project", priority: "Med", status: "OnTrack", leadUserId: c.id },
        select: { id: true },
      });
      projectIds.push({ tenantId: bId, id: pb.id });
      await tx.projectMember.create({ data: { tenantId: bId, projectId: pb.id, userId: c.id, role: "Developer" } });
      const t = await tx.projectTask.create({
        data: { tenantId: bId, projectId: pb.id, title: `MR tenant B task ${stamp}`, type: "Feature", status: "InProgress", approvalStatus: "Published", assigneeId: c.id, lastActivityAt: new Date() },
        select: { id: true },
      });
      await tx.blocker.create({ data: { tenantId: bId, projectId: pb.id, description: `MRB tenant B ${stamp}`, severity: "Low", status: "Open", raisedById: c.id, ownerId: c.id, taskId: t.id } });
    });
  });

  afterAll(async () => {
    for (const p of projectIds) {
      await withTenant({ tenantId: p.tenantId, userId: "seed" }, (tx) => tx.project.deleteMany({ where: { id: p.id } }));
    }
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  const titles = async (ctx: TenantContext) => (await runCustomReport(ctx, "myTasks", ["title"])).rows.map((r) => r.title);
  const codes = async (ctx: TenantContext) => (await runCustomReport(ctx, "myProjects", ["code"])).rows.map((r) => r.code);
  const blockers = async (ctx: TenantContext) => (await runCustomReport(ctx, "myBlockers", ["description"])).rows.map((r) => r.description);

  it("gates: a Member is OFFERED only the My datasets; the API's tenant-wide gates are unchanged", () => {
    expect(offeredDatasetKeys(me)).toEqual([...MY_DATASET_KEYS]);
    // BASE read permissions still let a Member run e.g. projects through the API, as before.
    expect(allowedDatasetKeys(me)).toEqual(expect.arrayContaining(["projects", "tasks", ...MY_DATASET_KEYS]));
    // A report reader is offered everything they may run, the My datasets included.
    const pm: TenantContext = { tenantId: rbId, userId: me.userId, roles: ["ProjectManager"] };
    expect(offeredDatasetKeys(pm).sort()).toEqual(REPORT_DATASETS.map((d) => d.key).sort());
  });

  it("myTasks: only my Published tasks (done ones included, drafts never), never another user's", async () => {
    const mine = await titles(me);
    expect(mine.sort()).toEqual([`MR mine done ${stamp}`, `MR mine on p3 ${stamp}`, `MR mine open ${stamp}`].sort());
    expect(await titles(other)).toEqual([`MR theirs ${stamp}`]);
  });

  it("myTasks: Blocked follows an Open blocker on the task", async () => {
    const rows = (await runCustomReport(me, "myTasks", ["title", "blocked"])).rows;
    const flag = (t: string) => rows.find((r) => r.title === t)?.blocked;
    expect(flag(`MR mine open ${stamp}`)).toBe(true);
    expect(flag(`MR mine done ${stamp}`)).toBe(false);
  });

  it("myProjects: projects I'm a member of or lead, with my role and my open tasks", async () => {
    expect((await codes(me)).sort()).toEqual([P("1"), P("3")].sort());
    const rows = (await runCustomReport(me, "myProjects", ["code", "role", "openTasks"])).rows;
    expect(rows.find((r) => r.code === P("1"))).toEqual({ code: P("1"), role: "Developer", openTasks: 1 });
    expect(rows.find((r) => r.code === P("3"))).toEqual({ code: P("3"), role: "Project lead", openTasks: 1 });
    // The other user's view is theirs alone (lead of P1 and P2, not P3).
    expect((await codes(other)).sort()).toEqual([P("1"), P("2")].sort());
  });

  it("myBlockers: raisedBy = me, plus the pre-UX6 fallback (owner = me AND task assigned to me) only", async () => {
    expect((await blockers(me)).sort()).toEqual([`MRB legacy own task ${stamp}`, `MRB raised by me ${stamp}`].sort());
    expect((await blockers(other)).sort()).toEqual([`MRB raised by other at me ${stamp}`, `MRB the other's ${stamp}`].sort());
    const row = (await runCustomReport(me, "myBlockers", ["description", "project", "owner", "status"])).rows.find(
      (r) => r.description === `MRB raised by me ${stamp}`,
    );
    expect(row).toMatchObject({ project: P("2"), status: "Open" });
    expect(typeof row?.owner).toBe("string"); // who can unblock = the other user
  });

  it("RLS: never another tenant's rows, and a forged ctx in another tenant reads nothing of mine", async () => {
    const all = [...(await titles(me)), ...(await codes(me)), ...(await blockers(me))];
    expect(all.some((v) => String(v).includes("tenant B") || v === P("B"))).toBe(false);
    // Demo Org B's Member sees exactly their own.
    expect(await titles(bMember)).toEqual([`MR tenant B task ${stamp}`]);
    expect(await codes(bMember)).toEqual([P("B")]);
    expect(await blockers(bMember)).toEqual([`MRB tenant B ${stamp}`]);
    // My user id under tenant B's RLS context: the where clause matches, RLS still hides it.
    const forged: TenantContext = { ...me, tenantId: bId };
    expect(await titles(forged)).toEqual([]);
    expect(await codes(forged)).toEqual([]);
    expect(await blockers(forged)).toEqual([]);
  });

  it("PDF path: the table export of a My dataset is allowed for a Member and holds only their rows", async () => {
    const report = await buildExport(me, { template: "table", dataset: "myTasks", columns: ["title", "project"] });
    expect(report.kind).toBe("table");
    expect(report.html).toContain(`MR mine open ${stamp}`);
    expect(report.html).not.toContain(`MR theirs ${stamp}`);
    expect(report.html).not.toContain(`MR tenant B task ${stamp}`);
  });
});

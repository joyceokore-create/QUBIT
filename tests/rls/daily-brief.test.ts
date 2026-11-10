// UX4 — the Daily Brief's role reads (UX plan D4). Requires a migrated, seeded DB.
// Each tenant's Brief reads only its own rows, and a read only happens with its permission.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { briefReadsFor, getBriefExtras, getDailyBrief } from "@/server/daily-brief";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("UX4 Daily Brief reads", () => {
  let rbId: string;
  let bId: string;
  let rbMember: TenantContext;
  let rbQa: TenantContext;
  let bCtx: TenantContext;
  let rbProjectId: string;
  let bProjectId: string;
  const now = new Date();
  const yesterday = new Date(now.getTime() - 2 * 86_400_000);

  beforeAll(async () => {
    const [rb, b] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !b) throw new Error("Seed required.");
    rbId = rb.id;
    bId = b.id;
    const [[rbUser, rbQaUser], [bUser]] = await Promise.all([createUsers(rbId, 2, "brief"), createUsers(bId, 1, "brief")]);
    rbMember = { tenantId: rbId, userId: rbUser.id, roles: ["Member"] };
    rbQa = { tenantId: rbId, userId: rbQaUser.id, roles: ["HeadOfQA"] };
    bCtx = { tenantId: bId, userId: bUser.id, roles: ["HeadOfQA", "Member"] };

    const mk = (ctx: TenantContext, tenantId: string, code: string, assigneeId: string) =>
      withTenant(ctx, async (tx) => {
        const p = await tx.project.create({
          data: { tenantId, code, name: `Brief fixture ${code}`, type: "Project", priority: "Med", status: "OnTrack" },
          select: { id: true },
        });
        await tx.projectTask.create({
          data: { tenantId, projectId: p.id, title: `Overdue task ${code}`, assigneeId, dueDate: yesterday, status: "InProgress" },
        });
        await tx.projectTask.create({
          data: { tenantId, projectId: p.id, title: `Critical bug ${code}`, type: "Bug", severity: "Critical", status: "InProgress" },
        });
        return p.id;
      });
    [rbProjectId, bProjectId] = await Promise.all([mk(rbMember, rbId, "BRFA1", rbUser.id), mk(bCtx, bId, "BRFB1", bUser.id)]);
  });

  afterAll(async () => {
    await withTenant(rbMember, (tx) => tx.project.deleteMany({ where: { id: rbProjectId } }));
    await withTenant(bCtx, (tx) => tx.project.deleteMany({ where: { id: bProjectId } }));
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  it("a Member's Brief names their own overdue task", async () => {
    const { brief, timeZone } = await getDailyBrief(rbMember, "Member", [], now);
    expect(timeZone).toBeTruthy();
    expect(brief.items[0]).toMatchObject({ group: "now", emphasis: "One task is overdue: Overdue task BRFA1." });
    expect(brief.items[0].action.href).toBe(`/projects/${rbProjectId}?tab=Board&task=${brief.items[0].id.replace("m-overdue-", "")}`);
  });

  it("RLS: a spoofed user id under the other tenant reads no tasks", async () => {
    const extras = await getBriefExtras({ ...bCtx, userId: rbMember.userId }, "Member", [], now);
    expect(extras.myTasks).toEqual([]);
  });

  it("RLS: Head of QA critical counts stay inside the tenant", async () => {
    const a = await getBriefExtras(rbQa, "HeadOfQA", [], now);
    expect(a.criticalByProject?.[rbProjectId]).toBe(1);
    expect(a.criticalByProject?.[bProjectId]).toBeUndefined();
    const b = await getBriefExtras(bCtx, "HeadOfQA", [], now);
    expect(b.criticalByProject?.[bProjectId]).toBe(1);
    expect(b.criticalByProject?.[rbProjectId]).toBeUndefined();
  });

  it("reads only what the viewer may act on", () => {
    const member = briefReadsFor("HeadOfProjects", { ...rbMember, permissions: ["project:read"] });
    expect(member).toMatchObject({ ideas: false, staffing: false, workload: true });
    const head = briefReadsFor("HeadOfProjects", { ...rbMember, permissions: ["project:read", "idea:triage", "staffing:manage"] });
    expect(head).toMatchObject({ ideas: true, staffing: true });
    const admin = briefReadsFor("PlatformSuperAdmin", { ...rbMember, permissions: ["admin:access"] });
    expect(admin).toMatchObject({ accessRequests: false, accounts: true });
  });
});

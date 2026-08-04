// M-P1d (docs/27 §2) — the resource-request lifecycle against the real database:
// raise (delivery-owner-scoped) → fill (creates the assignment, stamps the receipt,
// notifies) or decline (reason required); no double-resolution; bench ordering; RLS.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  benchFor,
  declineResourceRequest,
  fillResourceRequest,
  listResourceRequests,
  raiseResourceRequest,
} from "@/server/staffing";
import { createUsers, cleanupFixtureUsers } from "./_users";

const WINDOW = { windowStart: "2026-09-01T00:00:00.000Z", windowEnd: "2026-09-30T00:00:00.000Z" };

describe("M-P1d staffing flow", () => {
  let rbId: string;
  let dbId: string;
  let projectId: string;
  let pmCtx: TenantContext; // raises (PM-role member of the project)
  let headCtx: TenantContext; // resolves (staffing:manage)
  let pmId: string;
  let headId: string;
  let benchId: string; // the candidate who gets assigned
  let busyId: string; // heavily allocated candidate

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [pm, head, benchUser, busy] = await createUsers(rbId, 4, "stf");
    pmId = pm.id;
    headId = head.id;
    benchId = benchUser.id;
    busyId = busy.id;
    pmCtx = { tenantId: rbId, userId: pmId, roles: ["Member"] };
    headCtx = { tenantId: rbId, userId: headId, roles: ["HeadOfProjects"] };

    projectId = (
      await withTenant(pmCtx, (tx) => tx.project.findFirstOrThrow({ select: { id: true } }))
    ).id;
    await withTenant(pmCtx, async (tx) => {
      // The engine notifies actual grant HOLDERS — the ctx role alone is not a grant.
      await tx.roleAssignment.create({ data: { tenantId: rbId, userId: headId, role: "HeadOfProjects" } });
      await tx.projectMember.create({
        data: { tenantId: rbId, projectId, userId: pmId, role: "Project Manager" },
      });
      // The busy candidate: 90% booked, and away for part of the window.
      await tx.projectMember.create({
        data: { tenantId: rbId, projectId, userId: busyId, role: "Developer", allocationPct: 90 },
      });
      await tx.absence.create({
        data: {
          tenantId: rbId,
          userId: busyId,
          type: "Leave",
          startDate: new Date("2026-09-10"),
          endDate: new Date("2026-09-14"),
          createdById: pmId,
        },
      });
    });
  });

  afterAll(async () => {
    await withTenant(headCtx, async (tx) => {
      await tx.roleAssignment.deleteMany({ where: { userId: headId } });
      await tx.resourceRequest.deleteMany({ where: { projectId } });
      await tx.absence.deleteMany({ where: { userId: busyId } });
      await tx.projectMember.deleteMany({ where: { userId: { in: [pmId, benchId, busyId] } } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("an unrelated member cannot raise; the project's PM can", async () => {
    const outsider: TenantContext = { tenantId: rbId, userId: benchId, roles: ["Member"] };
    await expect(
      raiseResourceRequest(outsider, { projectId, role: "QA Engineer", allocationPct: 60, ...WINDOW }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const request = await raiseResourceRequest(pmCtx, {
      projectId,
      role: "QA Engineer",
      allocationPct: 60,
      ...WINDOW,
      note: "UAT regression pack needs a second QA",
    });
    expect(request.status).toBe("Open");
    // The Head was notified (a resource_request.created notification row exists).
    const headNote = await withTenant(headCtx, (tx) =>
      tx.notification.findFirst({ where: { userId: headId, kind: "resource_request.created" } }),
    );
    expect(headNote).not.toBeNull();
  });

  it("the bench sorts least-booked first and surfaces leave inside the window", async () => {
    const bench = await benchFor(headCtx, new Date(WINDOW.windowStart), new Date(WINDOW.windowEnd));
    const busy = bench.find((b) => b.userId === busyId)!;
    const free = bench.find((b) => b.userId === benchId)!;
    expect(busy.totalPct).toBe(90);
    expect(busy.awayDaysInWindow).toBeGreaterThanOrEqual(5);
    expect(free.totalPct).toBe(0);
    expect(bench.indexOf(free)).toBeLessThan(bench.indexOf(busy));
  });

  it("a PM cannot resolve; the Head fills → assignment created with the request's shape, receipt stamped, raiser notified", async () => {
    const open = (await listResourceRequests(pmCtx)).find((r) => r.status === "Open")!;
    await expect(fillResourceRequest(pmCtx, open.id, benchId)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const filled = await fillResourceRequest(headCtx, open.id, benchId);
    expect(filled.status).toBe("Filled");

    const member = await withTenant(headCtx, (tx) =>
      tx.projectMember.findUniqueOrThrow({
        where: { projectId_userId: { projectId, userId: benchId } },
      }),
    );
    expect(member.role).toBe("QA Engineer");
    expect(member.allocationPct).toBe(60);
    expect(member.startDate?.toISOString()).toBe(WINDOW.windowStart);
    expect(filled.filledMemberId).toBe(member.id);

    const raiserNote = await withTenant(pmCtx, (tx) =>
      tx.notification.findFirst({ where: { userId: pmId, kind: "resource_request.filled" } }),
    );
    expect(raiserNote).not.toBeNull();

    // No double resolution — filling or declining again refuses.
    await expect(fillResourceRequest(headCtx, open.id, benchId)).rejects.toMatchObject({ code: "ALREADY_RESOLVED" });
    await expect(declineResourceRequest(headCtx, open.id, "too late")).rejects.toMatchObject({ code: "ALREADY_RESOLVED" });
  });

  it("declining requires a reason and notifies the raiser with it", async () => {
    const request = await raiseResourceRequest(pmCtx, { projectId, role: "Implementor", allocationPct: 40, ...WINDOW });
    await expect(declineResourceRequest(headCtx, request.id, " ")).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    const declined = await declineResourceRequest(headCtx, request.id, "no Implementor bench until October");
    expect(declined.status).toBe("Declined");
    const note = await withTenant(pmCtx, (tx) =>
      tx.notification.findFirst({ where: { userId: pmId, kind: "resource_request.declined" } }),
    );
    expect(note?.message).toContain("no Implementor bench until October");
  });

  it("listing scopes: the PM sees only their own; the Head sees all", async () => {
    const mine = await listResourceRequests(pmCtx);
    expect(mine.every((r) => r.raisedByName.startsWith("Fixture"))).toBe(true);
    const all = await listResourceRequests(headCtx);
    expect(all.length).toBeGreaterThanOrEqual(mine.length);
  });

  it("tenant B sees nothing", async () => {
    const dbCtx: TenantContext = { tenantId: dbId, userId: "test", roles: ["HeadOfProjects"] };
    const rows = await listResourceRequests(dbCtx);
    expect(rows.find((r) => r.projectId === projectId)).toBeUndefined();
  });
});

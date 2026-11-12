// UX8 — Approvals v1: the feed lists only what the viewer can act on (idea triage needs
// idea:triage AND the engine's Head gate; staffing needs staffing:manage; the roll-up banner
// needs the roll-up approver), the badge count matches the list, and tenant B is blind.
// Requires a migrated, seeded DB. Synthetic data only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { canOpenApprovals, countApprovals, getApprovals } from "@/server/approvals";
import { createUsers, cleanupFixtureUsers } from "./_users";

const TAG = "zz-ux8 fixture";

interface Seeded {
  projectId: string;
  openIdeaIds: string[];
  closedIdeaId: string;
  openRequestId: string;
  closedRequestId: string;
}

async function seed(tenantId: string, raiserId: string, code: string): Promise<Seeded> {
  return withTenant({ tenantId, userId: raiserId }, async (tx) => {
    const project = await tx.project.create({
      data: { tenantId, code, name: `${TAG} project ${code}`, type: "Project", priority: "Med", status: "OnTrack" },
      select: { id: true },
    });
    const mk = (title: string, status: string, createdAt: Date) =>
      tx.idea.create({
        data: { tenantId, title: `${TAG} ${title}`, sponsor: "Sponsor user_001", problem: "A synthetic problem for the test.", submittedById: raiserId, status, createdAt },
        select: { id: true },
      });
    const older = await mk(`${code} new idea`, "New", new Date("2026-01-02T08:00:00Z"));
    const reviewing = await mk(`${code} reviewing idea`, "Reviewing", new Date("2026-01-03T08:00:00Z"));
    const parked = await mk(`${code} parked idea`, "Parked", new Date("2026-01-01T08:00:00Z"));
    const req = (status: string) =>
      tx.resourceRequest.create({
        data: {
          tenantId,
          projectId: project.id,
          raisedById: raiserId,
          role: "QA Engineer",
          allocationPct: 50,
          windowStart: new Date("2026-12-01T00:00:00Z"),
          windowEnd: new Date("2027-01-31T00:00:00Z"),
          status,
          createdAt: new Date("2026-01-01T09:00:00Z"),
        },
        select: { id: true },
      });
    const open = await req("Open");
    const declined = await req("Declined");
    return { projectId: project.id, openIdeaIds: [older.id, reviewing.id], closedIdeaId: parked.id, openRequestId: open.id, closedRequestId: declined.id };
  });
}

describe("UX8 approvals feed", () => {
  let rbId: string;
  let bId: string;
  let rbHead: TenantContext;
  let rbMember: TenantContext;
  let rbPm: TenantContext;
  let bHead: TenantContext;
  let rb: Seeded;
  let b: Seeded;

  beforeAll(async () => {
    const [rbT, bT] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rbT || !bT) throw new Error("Seed required.");
    rbId = rbT.id;
    bId = bT.id;
    const [[head, member, pm], [bHeadUser, bRaiser]] = await Promise.all([createUsers(rbId, 3, "apr"), createUsers(bId, 2, "apr")]);
    rbHead = { tenantId: rbId, userId: head.id, roles: ["HeadOfProjects"] };
    rbMember = { tenantId: rbId, userId: member.id, roles: ["Member"] };
    rbPm = { tenantId: rbId, userId: pm.id, roles: ["ProjectManager"] };
    bHead = { tenantId: bId, userId: bHeadUser.id, roles: ["HeadOfProjects"] };
    rb = await seed(rbId, pm.id, `UX8A${Date.now() % 100000}`);
    b = await seed(bId, bRaiser.id, `UX8B${Date.now() % 100000}`);
  });

  afterAll(async () => {
    for (const [ctx, s] of [
      [rbHead, rb],
      [bHead, b],
    ] as const) {
      if (!s) continue;
      await withTenant(ctx, async (tx) => {
        await tx.resourceRequest.deleteMany({ where: { projectId: s.projectId } });
        await tx.idea.deleteMany({ where: { title: { startsWith: TAG } } });
        await tx.project.deleteMany({ where: { id: s.projectId } });
      });
    }
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  const ids = (feed: Awaited<ReturnType<typeof getApprovals>>) => feed.items.map((i) => i.id);

  it("a Head sees the tenant's New/Reviewing ideas and Open requests — never decided ones", async () => {
    const feed = await getApprovals(rbHead);
    expect(feed.can).toEqual({ ideas: true, staffing: true, gates: "approver" }); // WS1: the Head signs off gates
    expect(ids(feed)).toEqual(expect.arrayContaining([...rb.openIdeaIds, rb.openRequestId]));
    expect(ids(feed)).not.toContain(rb.closedIdeaId);
    expect(ids(feed)).not.toContain(rb.closedRequestId);
    // Oldest first: the fixtures' order is request (09:00 1 Jan) → New (2 Jan) → Reviewing (3 Jan).
    const mine = ids(feed).filter((id) => [rb.openRequestId, ...rb.openIdeaIds].includes(id));
    expect(mine).toEqual([rb.openRequestId, ...rb.openIdeaIds]);
    // The roll-up approver gets the week summary.
    expect(feed.rollup).not.toBeNull();
    expect(feed.rollup!.total).toBeGreaterThanOrEqual(feed.rollup!.received);
  });

  it("a viewer without idea:triage or staffing:manage gets nothing (and can't open the page)", async () => {
    for (const ctx of [rbMember]) {
      expect(canOpenApprovals(ctx)).toBe(false);
      const feed = await getApprovals(ctx);
      expect(feed.items).toEqual([]);
      expect(feed.rollup).toBeNull();
      expect(await countApprovals(ctx)).toEqual({ ideas: 0, staffing: 0, gates: 0, total: 0 });
    }
  });

  it("WS1: a PM opens Approvals for their own gate submissions only — no ideas, staffing or roll-up", async () => {
    expect(canOpenApprovals(rbPm)).toBe(true);
    const feed = await getApprovals(rbPm);
    expect(feed.can).toEqual({ ideas: false, staffing: false, gates: "mine" });
    expect(feed.items.every((i) => i.kind === "gate")).toBe(true);
    expect(feed.rollup).toBeNull();
    expect((await countApprovals(rbPm)).ideas + (await countApprovals(rbPm)).staffing).toBe(0);
  });

  it("lists only what the viewer can act on: staffing:manage alone → requests only, no roll-up", async () => {
    const staffer: TenantContext = { ...rbPm, permissions: ["dashboard:read", "reports:read", "staffing:manage"] };
    expect(canOpenApprovals(staffer)).toBe(true);
    const feed = await getApprovals(staffer);
    expect(feed.can).toEqual({ ideas: false, staffing: true, gates: "mine" }); // a PM's own gates (WS1)
    expect(feed.items.every((i) => i.kind === "staffing" || i.kind === "gate")).toBe(true);
    expect(ids(feed)).toContain(rb.openRequestId);
    // reports:read without the Head role can't approve the roll-up, so no banner.
    expect(feed.rollup).toBeNull();
  });

  it("idea:triage without the engine's Head gate lists no ideas (the drawer would be refused)", async () => {
    const custom: TenantContext = { ...rbPm, permissions: ["dashboard:read", "idea:triage"] };
    expect(canOpenApprovals(custom)).toBe(true);
    const feed = await getApprovals(custom);
    expect(feed.can.ideas).toBe(false);
    expect(feed.items).toEqual([]);
    expect((await countApprovals(custom)).total).toBe(0);
  });

  it("RLS: tenant B's items never appear for Riverbank, and vice versa", async () => {
    const rbFeed = ids(await getApprovals(rbHead));
    for (const id of [...b.openIdeaIds, b.openRequestId]) expect(rbFeed).not.toContain(id);
    const bFeed = ids(await getApprovals(bHead));
    expect(bFeed).toEqual(expect.arrayContaining([...b.openIdeaIds, b.openRequestId]));
    for (const id of [...rb.openIdeaIds, rb.openRequestId]) expect(bFeed).not.toContain(id);
  });

  it("the badge count matches the list, per kind, in each tenant", async () => {
    for (const ctx of [rbHead, bHead]) {
      const [feed, count] = await Promise.all([getApprovals(ctx), countApprovals(ctx)]);
      expect(count.total).toBe(feed.items.length);
      expect(count.ideas).toBe(feed.items.filter((i) => i.kind === "idea").length);
      expect(count.staffing).toBe(feed.items.filter((i) => i.kind === "staffing").length);
    }
  });
});

// WS2 (UX fidelity Tier 4) — decisions waiting on the Group and GLC actions, under real RLS:
// tenant isolation both ways (reads, writes and the policy's WITH CHECK); who may raise (a PM
// only for their own project, a Head for any or none); only Executives decide (Head and PM
// can't); a decided request writes the project's Register `Decision`; deferral keeps it
// waiting; every mutation writes its audit row and notifies the right people.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { listDecisions } from "@/server/conversation";
import { getPortfolioHomeExtras } from "@/server/portfolio-home";
import {
  completeGlcAction,
  createGlcAction,
  decideRequest,
  DecisionError,
  getDecisionRequest,
  getDecisionsPage,
  raiseDecision,
} from "@/server/decision-requests";
import { createUsers, cleanupFixtureUsers } from "./_users";

const TZ = "Africa/Nairobi";
const TAG = "ws2 fixture";

/** A day key `n` days from today (UTC; safely clear of the zone edge for n >= 2). */
const dayFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function expectCode(p: Promise<unknown>, code: DecisionError["code"]) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof DecisionError && e.code === code);
}

describe("WS2 decision requests and GLC actions", () => {
  let rbId: string;
  let dbId: string;
  let head: TenantContext;
  let pm: TenantContext;
  let exec: TenantContext;
  let member: TenantContext;
  let bExec: TenantContext;
  let bHead: TenantContext;
  let ownProject: string; // led by the PM
  let otherProject: string; // no lead
  let bProject: string;
  const requestIds: string[] = [];
  const actionIds: string[] = [];

  beforeAll(async () => {
    const [rb, db] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [h, p, e, m] = await createUsers(rbId, 4, "ws2");
    const [be, bh] = await createUsers(dbId, 2, "ws2b");
    head = { tenantId: rbId, userId: h.id, roles: ["HeadOfProjects"] };
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    exec = { tenantId: rbId, userId: e.id, roles: ["Executive"] };
    member = { tenantId: rbId, userId: m.id, roles: ["Member"] };
    bExec = { tenantId: dbId, userId: be.id, roles: ["Executive"] };
    bHead = { tenantId: dbId, userId: bh.id, roles: ["HeadOfProjects"] };

    await withTenant(head, async (tx) => {
      // The outbox notifies from role_assignment rows (the session's roles are not enough).
      await tx.roleAssignment.createMany({
        data: [
          { tenantId: rbId, userId: h.id, role: "HeadOfProjects" },
          { tenantId: rbId, userId: p.id, role: "ProjectManager" },
          { tenantId: rbId, userId: e.id, role: "Executive" },
        ],
      });
      ownProject = (await tx.project.create({ data: { tenantId: rbId, code: "WS2A", name: `${TAG} own`, type: "Project", priority: "Med", status: "OnTrack", leadUserId: p.id }, select: { id: true } })).id;
      otherProject = (await tx.project.create({ data: { tenantId: rbId, code: "WS2B", name: `${TAG} other`, type: "Project", priority: "Med", status: "OnTrack" }, select: { id: true } })).id;
    });
    await withTenant(bHead, async (tx) => {
      await tx.roleAssignment.create({ data: { tenantId: dbId, userId: be.id, role: "Executive" } });
      bProject = (await tx.project.create({ data: { tenantId: dbId, code: "WS2C", name: `${TAG} tenant b`, type: "Project", priority: "Med", status: "OnTrack" }, select: { id: true } })).id;
    });
  });

  afterAll(async () => {
    for (const [ctx, projects] of [
      [head, [ownProject, otherProject]],
      [bHead, [bProject]],
    ] as const) {
      await withTenant(ctx, async (tx) => {
        await tx.glcAction.deleteMany({ where: { OR: [{ id: { in: actionIds } }, { title: { startsWith: TAG } }] } });
        const reqs = await tx.decisionRequest.findMany({ where: { OR: [{ id: { in: requestIds } }, { title: { startsWith: TAG } }] }, select: { id: true, decisionId: true } });
        await tx.decisionRequest.deleteMany({ where: { id: { in: reqs.map((r) => r.id) } } });
        await tx.decision.deleteMany({ where: { projectId: { in: [...projects] } } });
        const ids = [...reqs.map((r) => r.id), ...actionIds];
        await tx.domainEvent.deleteMany({ where: { entityId: { in: ids } } });
        // Raising notifies EVERY Executive in the tenant, seeded ones included — remove those too.
        if (ids.length) await tx.notification.deleteMany({ where: { OR: ids.map((id) => ({ link: { contains: id } })) } });
        await tx.auditLog.deleteMany({ where: { entityId: { in: ids } } });
        await tx.project.deleteMany({ where: { id: { in: [...projects] } } });
      });
    }
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(dbId);
    await prisma.$disconnect();
  });

  const raise = async (ctx: TenantContext, projectId: string | null, title: string, dueInDays = 5) => {
    const r = await raiseDecision(ctx, { title: `${TAG} ${title}`, projectId, context: "What is being asked.", ifApproved: "Go-live stays", ifDeclined: "Go-live moves", dueDate: dayFromNow(dueInDays) });
    requestIds.push(r.id);
    return r.id;
  };

  describe("who may raise", () => {
    it("a PM raises for their own project; Executives are notified; the raise is audited", async () => {
      const id = await raise(pm, ownProject, "pm own");
      const row = await getDecisionRequest(pm, id);
      expect(row?.status).toBe("waiting");
      expect(row?.options.map((o) => o.label)).toEqual(["If approved", "If declined"]);
      await withTenant(exec, async (tx) => {
        const n = await tx.notification.findFirst({ where: { userId: exec.userId, kind: "decision.raised", link: `/decisions?open=${id}` } });
        expect(n).not.toBeNull();
        const a = await tx.auditLog.findFirst({ where: { entityId: id, action: "decision.raise", actorId: pm.userId } });
        expect(a?.entityType).toBe("decision_request");
      });
    });

    it("a PM can't raise for a project they don't run, nor a Group-level one", async () => {
      await expectCode(raiseDecision(pm, { title: `${TAG} not mine`, projectId: otherProject }), "FORBIDDEN");
      await expectCode(raiseDecision(pm, { title: `${TAG} no project`, projectId: null }), "FORBIDDEN");
      await expectCode(raiseDecision(member, { title: `${TAG} member`, projectId: ownProject }), "FORBIDDEN");
    });

    it("a Head raises for any project, or none", async () => {
      expect(await raise(head, otherProject, "head any")).toBeTruthy();
      expect(await raise(head, null, "head group")).toBeTruthy();
    });

    it("a due date in the past is refused", async () => {
      await expectCode(raiseDecision(head, { title: `${TAG} past`, projectId: null, dueDate: dayFromNow(-3) }), "BAD_INPUT");
    });
  });

  describe("only Executives decide", () => {
    it("a Head and a PM can't decide (even the PM's own request)", async () => {
      const id = await raise(pm, ownProject, "not theirs to decide");
      await expectCode(decideRequest(head, id, { action: "approve" }), "FORBIDDEN");
      await expectCode(decideRequest(pm, id, { action: "approve" }), "FORBIDDEN");
      await expectCode(decideRequest(pm, id, { action: "defer", note: "later", dueDate: dayFromNow(9) }), "FORBIDDEN");
      expect((await getDecisionRequest(exec, id))?.status).toBe("waiting");
    });

    it("approve writes the Register Decision, audits it, and tells the raiser", async () => {
      const id = await raise(pm, ownProject, "approve me");
      const res = await decideRequest(exec, id, { action: "approve", note: "Review spend at the rehearsal." });
      expect(res.status).toBe("decided");
      expect(res.decisionId).toBeTruthy();
      const row = await getDecisionRequest(exec, id);
      expect(row).toMatchObject({ status: "decided", outcome: "approved", outcomeNote: "Review spend at the rehearsal.", decisionId: res.decisionId });
      // The project's Register (Decisions tab) reads the same Decision rows.
      const register = await listDecisions(pm, ownProject);
      const entry = register.find((d) => d.id === res.decisionId);
      expect(entry?.title).toBe(`Approved: ${TAG} approve me`);
      expect(entry?.rationale).toBe("Review spend at the rehearsal.");
      await withTenant(exec, async (tx) => {
        expect(await tx.auditLog.findFirst({ where: { entityId: id, action: "decision.decide", actorId: exec.userId } })).not.toBeNull();
        expect(await tx.auditLog.findFirst({ where: { entityId: res.decisionId!, action: "create", entityType: "decision" } })).not.toBeNull();
        expect(await tx.notification.findFirst({ where: { userId: pm.userId, kind: "decision.decided" } })).not.toBeNull();
      });
      // Recorded once: a second decision is a conflict.
      await expectCode(decideRequest(exec, id, { action: "decline", note: "changed my mind" }), "CONFLICT");
    });

    it("decline keeps the note; a Group-level request has no Register row", async () => {
      const id = await raise(head, null, "decline group");
      const res = await decideRequest(exec, id, { action: "decline", note: "Not this year." });
      expect(res.decisionId).toBeNull();
      expect(await getDecisionRequest(exec, id)).toMatchObject({ outcome: "declined", outcomeNote: "Not this year.", decisionId: null });
    });

    it("defer moves the due date, keeps it waiting, audits it and notifies the raiser and the PM", async () => {
      const id = await raise(head, ownProject, "defer me", 3);
      const res = await decideRequest(exec, id, { action: "defer", note: "After the vendor call.", dueDate: dayFromNow(12) });
      expect(res.status).toBe("deferred");
      const row = await getDecisionRequest(exec, id);
      expect(row?.status).toBe("deferred");
      expect((row?.dueDate ?? "").slice(0, 10) >= dayFromNow(11)).toBe(true);
      const waiting = await getDecisionsPage(exec, { tab: "waiting", q: "defer me", page: 1, size: 10 }, new Date(), TZ);
      expect(waiting.requests.map((r) => r.id)).toContain(id);
      await withTenant(exec, async (tx) => {
        expect(await tx.auditLog.findFirst({ where: { entityId: id, action: "decision.defer" } })).not.toBeNull();
        const told = await tx.notification.findMany({ where: { kind: "decision.deferred", link: `/decisions?open=${id}` }, select: { userId: true } });
        expect(told.map((n) => n.userId).sort()).toEqual([head.userId, pm.userId].sort());
      });
      // A deferred request can still be decided later.
      expect((await decideRequest(exec, id, { action: "approve" })).status).toBe("decided");
      // Deferring to today (or earlier) is refused.
      const id2 = await raise(head, null, "defer today");
      await expectCode(decideRequest(exec, id2, { action: "defer", note: "x".repeat(5), dueDate: dayFromNow(-1) }), "BAD_INPUT");
    });
  });

  describe("the list", () => {
    it("pages, searches and filters on the server", async () => {
      const page = await getDecisionsPage(exec, { tab: "waiting", q: TAG, page: 1, size: 5, projectId: ownProject }, new Date(), TZ);
      expect(page.requests.every((r) => r.projectId === ownProject && r.status !== "decided")).toBe(true);
      expect(page.info.size).toBe(5);
      const byPm = await getDecisionsPage(exec, { tab: "decided", q: TAG, page: 1, size: 10, personId: pm.userId }, new Date(), TZ);
      expect(byPm.requests.length).toBeGreaterThan(0);
      expect(byPm.requests.every((r) => r.raisedBy.id === pm.userId && r.status === "decided")).toBe(true);
      const none = await getDecisionsPage(exec, { tab: "waiting", q: "%", page: 1, size: 10 }, new Date(), TZ);
      expect(none.requests.every((r) => r.title.includes("%"))).toBe(true);
    });
  });

  describe("GLC actions", () => {
    it("an Executive creates one for an owner; a PM can't; the owner marks it done", async () => {
      await expectCode(createGlcAction(pm, { title: `${TAG} pm action` }), "FORBIDDEN");
      const { id } = await createGlcAction(exec, { title: `${TAG} action`, projectId: ownProject, ownerId: member.userId, dueDate: dayFromNow(4) });
      actionIds.push(id);
      await expectCode(completeGlcAction(pm, id), "FORBIDDEN");
      expect((await completeGlcAction(member, id)).status).toBe("done");
      await expectCode(completeGlcAction(exec, id), "CONFLICT");
      await withTenant(exec, async (tx) => {
        expect(await tx.auditLog.findFirst({ where: { entityId: id, action: "glc_action.create", actorId: exec.userId } })).not.toBeNull();
        expect(await tx.auditLog.findFirst({ where: { entityId: id, action: "glc_action.complete", actorId: member.userId } })).not.toBeNull();
        expect(await tx.notification.findFirst({ where: { userId: member.userId, kind: "glc_action.assigned" } })).not.toBeNull();
      });
      const list = await getDecisionsPage(head, { tab: "actions", q: TAG, page: 1, size: 10 }, new Date(), TZ);
      expect(list.actions.find((a) => a.id === id)?.status).toBe("done");
    });
  });

  describe("tenant isolation", () => {
    let bRequest: string;
    let aRequest: string;

    beforeAll(async () => {
      aRequest = await raise(head, ownProject, "tenant a only");
      bRequest = await raise(bHead, bProject, "tenant b only");
    });

    it("tenant B can't see, decide or act on tenant A's decisions (and A can't see B's)", async () => {
      expect(await getDecisionRequest(bExec, aRequest)).toBeNull();
      expect(await getDecisionRequest(exec, bRequest)).toBeNull();
      const bList = await getDecisionsPage(bExec, { tab: "waiting", q: TAG, page: 1, size: 100 }, new Date(), TZ);
      expect(bList.requests.map((r) => r.id)).toEqual([bRequest]);
      const aList = await getDecisionsPage(exec, { tab: "waiting", q: TAG, page: 1, size: 100 }, new Date(), TZ);
      expect(aList.requests.some((r) => r.id === bRequest)).toBe(false);
      await expectCode(decideRequest(bExec, aRequest, { action: "approve" }), "NOT_FOUND");
      await expectCode(decideRequest(exec, bRequest, { action: "approve" }), "NOT_FOUND");
      expect((await getDecisionRequest(exec, aRequest))?.status).toBe("waiting");
    });

    it("the Executive home lists only its own tenant's waiting decisions, with Go to the Decision per project", async () => {
      const a = await getPortfolioHomeExtras(exec, [], new Date());
      expect(a.decisions.top.length).toBeLessThanOrEqual(3);
      expect(a.decisions.byProject[ownProject]).toBeTruthy();
      expect(a.decisions.byProject[bProject]).toBeUndefined();
      const b = await getPortfolioHomeExtras(bExec, [], new Date());
      expect(b.decisions.byProject[bProject]).toBe(bRequest);
      expect(b.decisions.byProject[ownProject]).toBeUndefined();
      expect(b.decisions.total).toBeGreaterThanOrEqual(1);
    });

    it("tenant B can't raise against, or name an owner from, tenant A", async () => {
      await expectCode(raiseDecision(bHead, { title: `${TAG} cross`, projectId: ownProject }), "NOT_FOUND");
      await expectCode(createGlcAction(bExec, { title: `${TAG} cross owner`, ownerId: member.userId }), "NOT_FOUND");
      await expectCode(createGlcAction(bExec, { title: `${TAG} cross request`, decisionRequestId: aRequest }), "NOT_FOUND");
    });

    it("the policy's WITH CHECK refuses a row written into another tenant", async () => {
      await expect(
        withTenant(head, (tx) => tx.decisionRequest.create({ data: { tenantId: dbId, title: `${TAG} smuggled`, raisedById: bHead.userId } })),
      ).rejects.toThrow();
      await expect(withTenant(head, (tx) => tx.glcAction.create({ data: { tenantId: dbId, title: `${TAG} smuggled` } }))).rejects.toThrow();
    });

    it("outside a tenant context nothing is visible (FORCE RLS)", async () => {
      expect(await prisma.decisionRequest.count({ where: { id: { in: [aRequest, bRequest] } } })).toBe(0);
      expect(await prisma.glcAction.count({ where: { id: { in: actionIds } } })).toBe(0);
    });
  });
});

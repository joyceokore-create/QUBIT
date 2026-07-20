// Project join-request flow (Phase 5). Requires a seeded DB. Tests run in order (shared fixture).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { requestToJoin, listPendingForApprover, approveJoinRequest, denyJoinRequest, JoinRequestError } from "@/server/join-requests";

describe("join requests (Phase 5)", () => {
  let tenantId: string;
  let leadId: string;
  let reqId: string;
  let execId: string;
  let outsiderId: string;
  let headId: string;
  let projectId: string;
  let orphanProjectId: string; // no lead, no PM member — exercises the HeadOfProjects fallback

  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) throw new Error("join-request tests require seeded data — run `pnpm prisma:seed` first.");
    tenantId = kcb.id;
    await withTenant({ tenantId, userId: "seed" }, async (tx) => {
      const [lead, req, exec, outsider, head] = await Promise.all([
        tx.user.create({ data: { tenantId, email: "jr-lead@fixture.invalid", name: "JR Lead", status: "ACTIVE" } }),
        tx.user.create({ data: { tenantId, email: "jr-req@fixture.invalid", name: "JR Requester", status: "ACTIVE" } }),
        tx.user.create({ data: { tenantId, email: "jr-exec@fixture.invalid", name: "JR Exec", status: "ACTIVE" } }),
        tx.user.create({ data: { tenantId, email: "jr-out@fixture.invalid", name: "JR Outsider", status: "ACTIVE" } }),
        tx.user.create({ data: { tenantId, email: "jr-head@fixture.invalid", name: "JR Head", status: "ACTIVE" } }),
      ]);
      leadId = lead.id;
      reqId = req.id;
      execId = exec.id;
      outsiderId = outsider.id;
      headId = head.id;
      await tx.roleAssignment.create({ data: { tenantId, userId: exec.id, role: "Executive" } });
      await tx.roleAssignment.create({ data: { tenantId, userId: head.id, role: "HeadOfProjects" } });
      const project = await tx.project.create({
        data: { tenantId, code: "JR-TEST-01", name: "Join Test", type: "Project", priority: "Medium", status: "OnTrack", leadUserId: lead.id },
      });
      projectId = project.id;
      const orphan = await tx.project.create({
        data: { tenantId, code: "JR-TEST-02", name: "Orphan Join Test", type: "Project", priority: "Medium", status: "Planning" },
      });
      orphanProjectId = orphan.id;
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId, userId: "seed" }, async (tx) => {
      const ids = [leadId, reqId, execId, outsiderId, headId];
      await tx.joinRequest.deleteMany({ where: { projectId: { in: [projectId, orphanProjectId] } } });
      await tx.projectMember.deleteMany({ where: { projectId: { in: [projectId, orphanProjectId] } } });
      await tx.project.deleteMany({ where: { id: { in: [projectId, orphanProjectId] } } });
      await tx.notification.deleteMany({ where: { userId: { in: ids } } }); // Notification.user FK is RESTRICT
      await tx.roleAssignment.deleteMany({ where: { userId: { in: [execId, headId] } } });
      await tx.user.deleteMany({ where: { id: { in: ids } } });
    });
    await prisma.$disconnect();
  });

  const ctx = (userId: string, roles: string[] = ["Member"]): TenantContext => ({ tenantId, userId, roles });
  const memberRow = (userId: string, select: object = { id: true }) =>
    withTenant(ctx(leadId), (tx) => tx.projectMember.findFirst({ where: { projectId, userId }, select }));

  it("anyone can request to join; the lead sees it queued; a repeat is idempotent", async () => {
    const r1 = await requestToJoin(ctx(reqId), projectId, {});
    expect(r1.status).toBe("Pending");
    expect(r1.alreadyPending).toBe(false);
    const r2 = await requestToJoin(ctx(reqId), projectId, {});
    expect(r2.alreadyPending).toBe(true);
    const queue = await listPendingForApprover(ctx(leadId));
    expect(queue.some((q) => q.userId === reqId && q.projectId === projectId)).toBe(true);
  });

  it("a non-lead / non-PM cannot approve", async () => {
    const req = (await listPendingForApprover(ctx(leadId))).find((q) => q.userId === reqId)!;
    await expect(approveJoinRequest(ctx(outsiderId), req.id)).rejects.toBeInstanceOf(JoinRequestError);
  });

  it("the lead approves → the requester becomes a member and the request clears", async () => {
    const req = (await listPendingForApprover(ctx(leadId))).find((q) => q.userId === reqId)!;
    await approveJoinRequest(ctx(leadId), req.id);
    expect(await memberRow(reqId)).not.toBeNull();
    expect((await listPendingForApprover(ctx(leadId))).some((q) => q.userId === reqId)).toBe(false);
  });

  it("an Executive who joins is granted Stakeholder (not the requested delivery role)", async () => {
    await requestToJoin(ctx(execId, ["Executive"]), projectId, { requestedRole: "Developer" });
    const req = (await listPendingForApprover(ctx(leadId))).find((q) => q.userId === execId)!;
    await approveJoinRequest(ctx(leadId), req.id);
    const m = (await memberRow(execId, { role: true })) as { role: string } | null;
    expect(m?.role).toBe("Stakeholder");
  });

  it("deny leaves no membership", async () => {
    await requestToJoin(ctx(outsiderId), projectId, {});
    const req = (await listPendingForApprover(ctx(leadId))).find((q) => q.userId === outsiderId)!;
    await denyJoinRequest(ctx(leadId), req.id);
    expect(await memberRow(outsiderId)).toBeNull();
  });

  it("an existing member can't request again", async () => {
    await expect(requestToJoin(ctx(reqId), projectId, {})).rejects.toBeInstanceOf(JoinRequestError);
  });

  it("notifies the project's lead/PM when someone requests to join (Phase 6, per Joyce)", async () => {
    // The very first request in this suite (reqId → projectId) should have notified the lead.
    const notes = await withTenant(ctx(leadId), (tx) =>
      tx.notification.findMany({ where: { userId: leadId, kind: "join_request" } }),
    );
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0].message).toContain("JR Requester");
    expect(notes[0].link).toBe("/my-tasks");
  });

  it("falls back to HeadOfProjects when the project has no lead or PM member", async () => {
    await requestToJoin(ctx(reqId), orphanProjectId, { requestedRole: "Developer" });
    const headNotes = await withTenant(ctx(headId), (tx) =>
      tx.notification.findMany({ where: { userId: headId, kind: "join_request" } }),
    );
    expect(headNotes.some((n) => n.message.includes("Orphan Join Test"))).toBe(true);
  });
});

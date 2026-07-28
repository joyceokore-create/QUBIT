// M4 conversation end-to-end: polymorphic comments on all four entity types, one-level
// threads, mention + reply notifications through the outbox, promote-to-Decision gates,
// delete permissions, the event-sourced activity feed, and tenant isolation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  ConversationError,
  deleteComment,
  listComments,
  listDecisions,
  postComment,
  promoteToDecision,
} from "@/server/conversation";
import { listProjectActivity } from "@/server/activity-feed";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

describe("M4 conversation", () => {
  let kcbId: string;
  let riverbankId: string;
  let leadId: string;
  let memberId: string;
  let projectId: string;
  let taskId: string;
  let riskId: string;
  let documentId: string;
  let leadCtx: TenantContext;
  let memberCtx: TenantContext;

  beforeAll(async () => {
    const [kcb, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !riverbank) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    riverbankId = riverbank.id;
    const [lead, member] = await ensureUsers(kcbId, 2);
    leadId = lead.id;
    memberId = member.id;
    leadCtx = { tenantId: kcbId, userId: leadId, roles: ["Member"] };
    memberCtx = { tenantId: kcbId, userId: memberId, roles: ["Member"] };

    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId: kcbId,
          code: `CNV${Date.now() % 100000}`,
          name: "Conversation Fixture",
          type: "Project",
          priority: "High",
          status: "OnTrack",
          leadUserId: leadId,
        },
      });
      projectId = project.id;
      const task = await tx.projectTask.create({
        data: { tenantId: kcbId, projectId, title: "Draft integration contract", status: "InProgress", approvalStatus: "Published" },
      });
      taskId = task.id;
      const risk = await tx.risk.create({
        data: { tenantId: kcbId, projectId, title: "Vendor API instability", probability: 3, impact: 4, status: "Open" },
      });
      riskId = risk.id;
      const doc = await tx.projectDocument.create({
        data: { tenantId: kcbId, projectId, title: "Integration BRD", kind: "BRD", content: "…", createdById: leadId },
      });
      documentId = doc.id;
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      await tx.workComment.deleteMany({ where: { projectId } });
      await tx.decision.deleteMany({ where: { projectId } });
      await tx.notification.deleteMany({ where: { kind: { in: ["mention", "comment_reply"] } } });
      await tx.domainEvent.deleteMany({ where: { type: { in: ["comment.posted", "decision.recorded"] } } });
      await tx.auditLog.deleteMany({ where: { entityType: { in: ["work_comment", "decision"] } } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("posts on all four entity types and derives the project", async () => {
    for (const [entityType, entityId] of [
      ["project", projectId],
      ["project_task", taskId],
      ["risk", riskId],
      ["project_document", documentId],
    ] as const) {
      const view = await postComment(memberCtx, { entityType, entityId, body: `Comment on ${entityType}`, mentionUserIds: [] });
      expect(view.id).toBeTruthy();
    }
    const row = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.workComment.findFirst({ where: { entityType: "risk", entityId: riskId } }),
    );
    expect(row?.projectId).toBe(projectId); // derived, never client-supplied
  });

  it("rejects a comment on a nonexistent entity", async () => {
    await expect(
      postComment(memberCtx, { entityType: "project_task", entityId: "no-such-task", body: "hello", mentionUserIds: [] }),
    ).rejects.toThrow(ConversationError);
  });

  it("notifies mentioned users and threads replies to the root, pinging the author", async () => {
    const root = await postComment(memberCtx, {
      entityType: "project_task",
      entityId: taskId,
      body: `@Fixture lead — can you unblock this?`,
      mentionUserIds: [leadId],
    });
    const mentionNote = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.notification.findFirst({ where: { userId: leadId, kind: "mention" } }),
    );
    expect(mentionNote?.message).toContain("mentioned you");
    expect(mentionNote?.link).toContain(`task=${taskId}`);

    const reply = await postComment(leadCtx, {
      entityType: "project_task",
      entityId: taskId,
      parentId: root.id,
      body: "On it — vendor call booked.",
      mentionUserIds: [],
    });
    expect(reply.parentId).toBe(root.id);

    const replyNote = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.notification.findFirst({ where: { userId: memberId, kind: "comment_reply" } }),
    );
    expect(replyNote?.message).toContain("replied");

    const thread = await listComments(memberCtx, "project_task", taskId);
    const rootView = thread.find((c) => c.id === root.id)!;
    expect(rootView.replies.map((r) => r.id)).toContain(reply.id);

    // A reply to a reply still lands on the root — one-level threads.
    const nested = await postComment(memberCtx, {
      entityType: "project_task",
      entityId: taskId,
      parentId: reply.id,
      body: "Thanks!",
      mentionUserIds: [],
    });
    expect(nested.parentId).toBe(root.id);
  });

  it("drops invalid mention ids instead of storing them", async () => {
    const view = await postComment(memberCtx, {
      entityType: "project",
      entityId: projectId,
      body: "@Ghost see this",
      mentionUserIds: ["00000000-0000-0000-0000-000000000000"],
    });
    expect(view.mentions).toHaveLength(0);
  });

  it("promote-to-Decision is PM-level and links both ways", async () => {
    const comment = await postComment(leadCtx, {
      entityType: "project",
      entityId: projectId,
      body: "Agreed: we adopt the vendor's v2 API and drop the custom shim.",
      mentionUserIds: [],
    });

    // A plain member is refused.
    await expect(promoteToDecision(memberCtx, comment.id, { title: "Adopt v2 API" })).rejects.toThrow("PM-level");

    // The lead promotes.
    const decision = await promoteToDecision(leadCtx, comment.id, { title: "Adopt vendor v2 API" });
    expect(decision.decidedByName).toBeTruthy();

    const decisions = await listDecisions(memberCtx, projectId);
    expect(decisions.map((d) => d.id)).toContain(decision.id);
    expect(decisions[0].sourceCommentId).toBe(comment.id);

    const linked = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.workComment.findUniqueOrThrow({ where: { id: comment.id }, select: { decisionId: true } }),
    );
    expect(linked.decisionId).toBe(decision.id);

    // Promoting twice is refused.
    await expect(promoteToDecision(leadCtx, comment.id, { title: "again" })).rejects.toThrow("already a decision");
  });

  it("delete is author-or-PM", async () => {
    const c = await postComment(memberCtx, { entityType: "project", entityId: projectId, body: "typo, deleting", mentionUserIds: [] });
    const stranger = { tenantId: kcbId, userId: "00000000-0000-0000-0000-000000000000", roles: ["Member"] };
    await expect(deleteComment(stranger, c.id)).rejects.toThrow(ConversationError);
    await deleteComment(memberCtx, c.id); // author OK
    const c2 = await postComment(memberCtx, { entityType: "project", entityId: projectId, body: "PM may moderate", mentionUserIds: [] });
    await deleteComment(leadCtx, c2.id); // lead (canWriteProject) OK
  });

  it("feeds the activity feed from the outbox", async () => {
    const activity = await listProjectActivity(memberCtx, projectId);
    const types = activity.map((a) => a.type);
    expect(types).toContain("comment.posted");
    expect(types).toContain("decision.recorded");
    const decisionLine = activity.find((a) => a.type === "decision.recorded")!;
    expect(decisionLine.text).toContain("Adopt vendor v2 API");
    expect(decisionLine.actorName).toBeTruthy();
  });

  it("keeps comments and decisions tenant-isolated", async () => {
    const cross = await withTenant({ tenantId: riverbankId, userId: "test" }, (tx) =>
      Promise.all([tx.workComment.findMany({ where: { projectId } }), tx.decision.findMany({ where: { projectId } })]),
    );
    expect(cross[0]).toHaveLength(0);
    expect(cross[1]).toHaveLength(0);
    expect(await prisma.workComment.findMany({ take: 1 })).toHaveLength(0);
    expect(await prisma.decision.findMany({ take: 1 })).toHaveLength(0);
  });
});

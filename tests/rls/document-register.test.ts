// M8-B document register (docs/16 §6): real types, versioning that supersedes rather
// than overwrites, and a review workflow where only NAMED approvers decide. The status
// vocabulary moved (PendingReview → InReview, Final → Approved) via a DM1.18 loop, and
// the M8-A gate rules read the new words.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  DocumentError,
  createDocument,
  getDocument,
  listDocuments,
  newVersion,
  recordDecision,
  submitForReview,
} from "@/server/documents";
import { getProjectCheckpoints } from "@/server/checkpoints";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("M8-B document register", () => {
  let kcbId: string;
  let authorId: string;
  let approverAId: string;
  let approverBId: string;
  let outsiderId: string;
  let authorCtx: TenantContext;
  let aCtx: TenantContext;
  let bCtx: TenantContext;
  let outsiderCtx: TenantContext;
  let projectId: string;
  let docId: string;

  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    const [author, a, b, outsider] = await createUsers(kcbId, 4, "doc");
    authorId = author.id;
    approverAId = a.id;
    approverBId = b.id;
    outsiderId = outsider.id;
    authorCtx = { tenantId: kcbId, userId: authorId, roles: ["Member"] };
    aCtx = { tenantId: kcbId, userId: approverAId, roles: ["Member"] };
    bCtx = { tenantId: kcbId, userId: approverBId, roles: ["Member"] };
    outsiderCtx = { tenantId: kcbId, userId: outsiderId, roles: ["Member"] };

    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId: kcbId,
          code: `DR${Date.now() % 100000}`,
          name: "Register Fixture",
          type: "Project",
          priority: "High",
          status: "OnTrack",
          leadUserId: authorId,
        },
      });
      projectId = project.id;
    });
    const doc = await createDocument(authorCtx, projectId, {
      title: "Business requirements",
      kind: "BRD",
      content: "The system must reconcile nightly.",
    });
    docId = doc.id;
  });

  afterAll(async () => {
    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      await tx.domainEvent.deleteMany({ where: { type: { in: ["document.submitted", "document.decided"] } } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("§10-style check: the DM1.18 remap left no legacy status in either tenant", async () => {
    for (const slug of ["kcb", "riverbank"]) {
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } });
      const legacy = await withTenant({ tenantId: tenant.id, userId: "test" }, (tx) =>
        tx.projectDocument.count({ where: { status: { in: ["PendingReview", "Final"] } } }),
      );
      expect(legacy).toBe(0);
    }
  });

  it("documents enter the register as drafts — nothing arrives pre-approved", async () => {
    const rows = await listDocuments(authorCtx, projectId);
    const doc = rows.find((d) => d.id === docId)!;
    expect(doc.status).toBe("Draft");
    expect(doc.version).toBe(1);
    expect(doc.approvals).toEqual([]);
  });

  it("submitting names the approvers and moves it to InReview", async () => {
    await submitForReview(authorCtx, docId, [approverAId, approverBId]);
    const doc = (await getDocument(authorCtx, docId))!;
    expect(doc.status).toBe("InReview");
    expect(doc.approvals.map((a) => a.approverId).sort()).toEqual([approverAId, approverBId].sort());
    expect(doc.approvals.every((a) => a.decision === "Pending")).toBe(true);

    // Both approvers were told; the submitter was not.
    const notified = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.notification.findMany({ where: { kind: "document_review" }, select: { userId: true } }),
    );
    const ids = new Set(notified.map((n) => n.userId));
    expect(ids.has(approverAId)).toBe(true);
    expect(ids.has(approverBId)).toBe(true);
    expect(ids.has(authorId)).toBe(false);
  });

  it("only a NAMED approver may decide", async () => {
    await expect(recordDecision(outsiderCtx, docId, { decision: "Approved" })).rejects.toThrowError(DocumentError);
    // The author is not automatically an approver either.
    await expect(recordDecision(authorCtx, docId, { decision: "Approved" })).rejects.toThrowError(DocumentError);
  });

  it("one approval is not enough — every named approver must approve", async () => {
    await recordDecision(aCtx, docId, { decision: "Approved", comment: "Reads well." });
    let doc = (await getDocument(authorCtx, docId))!;
    expect(doc.status).toBe("InReview"); // still waiting on B

    await recordDecision(bCtx, docId, { decision: "Approved" });
    doc = (await getDocument(authorCtx, docId))!;
    expect(doc.status).toBe("Approved");
    expect(doc.approvals.every((a) => a.decision === "Approved")).toBe(true);
  });

  it("an approved BRD satisfies the M8-A gate rule that reads the register", async () => {
    // The BRD gate also wants an allocated team, so give it one.
    await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.projectMember.create({ data: { tenantId: kcbId, projectId, userId: authorId, role: "Project Manager" } }),
    );
    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const tmpl = await tx.checkpointTemplate.findFirstOrThrow({ where: { name: "Product build" }, select: { id: true } });
      await tx.project.update({ where: { id: projectId }, data: { checkpointTemplateId: tmpl.id } });
    });
    const view = await getProjectCheckpoints(authorCtx, projectId);
    const brd = view.rows.find((r) => r.name === "BRD")!;
    expect(brd.gate.find((g) => g.key === "brd-approved")!.met).toBe(true);
  });

  it("a rejection sends the document back rather than half-approving it", async () => {
    const second = await createDocument(authorCtx, projectId, { title: "Test plan", kind: "TestPlan" });
    await submitForReview(authorCtx, second.id, [approverAId, approverBId]);
    await recordDecision(aCtx, second.id, { decision: "Approved" });
    await recordDecision(bCtx, second.id, { decision: "Rejected", comment: "Missing the rollback path." });

    const doc = (await getDocument(authorCtx, second.id))!;
    expect(doc.status).toBe("Rejected");
    expect(doc.approvals.find((a) => a.approverId === approverBId)!.comment).toContain("rollback");

    // Re-submitting clears the old decisions — a fresh review, not a half-remembered one.
    await submitForReview(authorCtx, second.id, [approverAId]);
    const resubmitted = (await getDocument(authorCtx, second.id))!;
    expect(resubmitted.status).toBe("InReview");
    expect(resubmitted.approvals).toHaveLength(1);
    expect(resubmitted.approvals[0].decision).toBe("Pending");
  });

  it("a new version supersedes its predecessor instead of overwriting it", async () => {
    const { id: v2Id } = await newVersion(authorCtx, docId, { title: "Business requirements (rev B)" });
    const rows = await listDocuments(authorCtx, projectId);
    const v1 = rows.find((d) => d.id === docId)!;
    const v2 = rows.find((d) => d.id === v2Id)!;

    expect(v2.version).toBe(2);
    expect(v2.supersedesId).toBe(docId);
    expect(v2.status).toBe("Draft"); // a new version starts unapproved
    // The approved v1 is still there, still approved, now marked superseded.
    expect(v1.status).toBe("Approved");
    expect(v1.superseded).toBe(true);

    // Approving is refused on an already-approved document — raise a version instead.
    await expect(submitForReview(authorCtx, docId, [approverAId])).rejects.toThrowError(DocumentError);
  });

  it("RLS: the other tenant sees none of this register", async () => {
    const riverbank = await prisma.tenant.findUniqueOrThrow({ where: { slug: "riverbank" } });
    const [rvUser] = await createUsers(riverbank.id, 1, "docrv");
    const rvCtx = { tenantId: riverbank.id, userId: rvUser.id, roles: ["Member"] };
    expect(await getDocument(rvCtx, docId)).toBeNull();
    expect(await listDocuments(rvCtx, projectId)).toEqual([]);
    await cleanupFixtureUsers(riverbank.id);
  });
});

// M8-C requirements + traceability (docs/16 §6): extraction PROPOSES and never writes,
// accepted requirements keep their source anchors, coverage names the uncovered anchors,
// and the pilot gate + QA strip both read the same derived number.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  RequirementError,
  acceptCandidates,
  extractCandidates,
  getCoverage,
  listRequirements,
  setRequirementTaskLink,
} from "@/server/requirements";
import { getProjectCheckpoints } from "@/server/checkpoints";
import { getQaDashboard } from "@/server/dashboard-qa";
import { createUsers, cleanupFixtureUsers } from "./_users";

const URS_TEXT = `
## 3.1 Settlement
The system must reconcile mobile wallet transactions nightly.
The platform shall retry a failed settlement up to three times.

## 3.2 Reporting
Users should be able to export a statement as PDF.
`;

describe("M8-C requirements + traceability", () => {
  let kcbId: string;
  let leadId: string;
  let ctx: TenantContext;
  let projectId: string;
  let docId: string;
  let taskId: string;
  let otherProjectTaskId: string;

  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    const [lead] = await createUsers(kcbId, 1, "req");
    leadId = lead.id;
    ctx = { tenantId: kcbId, userId: leadId, roles: ["Member"] };

    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId: kcbId,
          code: `RQ${Date.now() % 100000}`,
          name: "Requirements Fixture",
          type: "Project",
          priority: "High",
          status: "OnTrack",
          leadUserId: leadId,
        },
      });
      projectId = project.id;
      await tx.projectMember.create({ data: { tenantId: kcbId, projectId, userId: leadId, role: "QA Engineer" } });

      const doc = await tx.projectDocument.create({
        data: { tenantId: kcbId, projectId, title: "Payments URS", kind: "URS", status: "Approved", content: URS_TEXT },
      });
      docId = doc.id;

      const task = await tx.projectTask.create({
        data: {
          tenantId: kcbId, projectId, title: "Build nightly reconciliation job",
          type: "Feature", status: "InProgress", approvalStatus: "Published",
        },
      });
      taskId = task.id;

      const other = await tx.project.findFirstOrThrow({ where: { id: { not: projectId } }, select: { id: true } });
      const strayTask = await tx.projectTask.create({
        data: {
          tenantId: kcbId, projectId: other.id, title: "Unrelated work",
          type: "Feature", status: "NotStarted", approvalStatus: "Published",
        },
      });
      otherProjectTaskId = strayTask.id;
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      await tx.domainEvent.deleteMany({ where: { type: "requirements.accepted" } });
      await tx.projectTask.deleteMany({ where: { id: otherProjectTaskId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("extraction PROPOSES and writes nothing (§6 never auto-apply)", async () => {
    const { candidates, usedAi } = await extractCandidates(ctx, docId);
    expect(candidates).toHaveLength(3);
    expect(candidates[0].sectionAnchor).toBe("3.1 Settlement");
    expect(usedAi).toBe(false); // the Q AI box is unconfigured in tests — parser path
    // Crucially: nothing was persisted by reading.
    expect(await listRequirements(ctx, projectId)).toEqual([]);
  });

  it("refuses to read a document with no text rather than inventing requirements", async () => {
    const emptyId = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.projectDocument
        .create({ data: { tenantId: kcbId, projectId, title: "Empty", kind: "URS", status: "Draft" } })
        .then((d) => d.id),
    );
    await expect(extractCandidates(ctx, emptyId)).rejects.toThrowError(RequirementError);
  });

  it("accepting only the ticked candidates creates requirements that keep their anchors", async () => {
    const { candidates } = await extractCandidates(ctx, docId);
    // The human keeps two of three — the third is not a requirement they want tracked.
    const rows = await acceptCandidates(ctx, projectId, {
      documentId: docId,
      accepted: [candidates[0], candidates[1]],
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.ref)).toEqual(["REQ-001", "REQ-002"]);
    expect(rows[0].sectionAnchor).toBe("3.1 Settlement");
    expect(rows[0].sourceDocumentTitle).toBe("Payments URS");
    expect(rows.every((r) => !r.covered)).toBe(true); // nothing links to them yet
  });

  it("coverage names the uncovered anchors rather than reporting a bare number", async () => {
    let coverage = await getCoverage(ctx, projectId);
    expect(coverage).toMatchObject({ total: 2, covered: 0, pct: 0 });
    expect(coverage.uncovered.map((u) => u.sectionAnchor)).toEqual(["3.1 Settlement", "3.1 Settlement"]);

    const [first] = await listRequirements(ctx, projectId);
    await setRequirementTaskLink(ctx, first.id, taskId, true);

    coverage = await getCoverage(ctx, projectId);
    expect(coverage).toMatchObject({ total: 2, covered: 1, pct: 50 });
    expect(coverage.uncovered).toHaveLength(1);
    expect(coverage.uncovered[0].ref).toBe("REQ-002");
  });

  it("a task from another project is not evidence for this requirement", async () => {
    const [first] = await listRequirements(ctx, projectId);
    await expect(setRequirementTaskLink(ctx, first.id, otherProjectTaskId, true)).rejects.toThrowError(RequirementError);
  });

  it("a Draft task is not coverage — only published work counts", async () => {
    const [, second] = await listRequirements(ctx, projectId);
    const draftTaskId = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.projectTask
        .create({
          data: {
            tenantId: kcbId, projectId, title: "AI-drafted idea",
            type: "Feature", status: "NotStarted", approvalStatus: "Draft",
          },
        })
        .then((t) => t.id),
    );
    await setRequirementTaskLink(ctx, second.id, draftTaskId, true);
    const coverage = await getCoverage(ctx, projectId);
    expect(coverage.covered).toBe(1); // unchanged — the draft link proves nothing
    expect(coverage.pct).toBe(50);
  });

  it("the pilot gate reads coverage, and the QA strip shows the same number", async () => {
    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const tmpl = await tx.checkpointTemplate.findFirstOrThrow({ where: { name: "Product build" }, select: { id: true } });
      await tx.project.update({ where: { id: projectId }, data: { checkpointTemplateId: tmpl.id } });
    });
    const view = await getProjectCheckpoints(ctx, projectId);
    const uat = view.rows.find((r) => r.name === "UAT")!;
    const rule = uat.gate.find((g) => g.key === "requirement-coverage")!;
    expect(rule.met).toBe(false); // 50% is under the 80% threshold
    expect(rule.detail).toContain("50% of 2 requirements");

    const qa = await getQaDashboard(ctx);
    expect(qa.quality.find((q) => q.projectId === projectId)!.coveragePct).toBe(50);
  });

  it("a project with NO requirements does not fail the gate on an empty set", async () => {
    const bareId = await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const tmpl = await tx.checkpointTemplate.findFirstOrThrow({ where: { name: "Product build" }, select: { id: true } });
      const p = await tx.project.create({
        data: {
          tenantId: kcbId, code: `RQB${Date.now() % 100000}`, name: "No Requirements Fixture",
          type: "Project", priority: "Med", status: "OnTrack", checkpointTemplateId: tmpl.id,
        },
      });
      return p.id;
    });
    const view = await getProjectCheckpoints(ctx, bareId);
    const rule = view.rows.find((r) => r.name === "UAT")!.gate.find((g) => g.key === "requirement-coverage")!;
    expect(rule.met).toBe(true); // nothing to cover ≠ failing to cover
    await withTenant({ tenantId: kcbId, userId: "test" }, (tx) => tx.project.deleteMany({ where: { id: bareId } }));
  });

  it("RLS: the other tenant sees none of these requirements", async () => {
    const riverbank = await prisma.tenant.findUniqueOrThrow({ where: { slug: "riverbank" } });
    const [rvUser] = await createUsers(riverbank.id, 1, "reqrv");
    const rvCtx = { tenantId: riverbank.id, userId: rvUser.id, roles: ["Member"] };
    expect(await listRequirements(rvCtx, projectId)).toEqual([]);
    expect((await getCoverage(rvCtx, projectId)).total).toBe(0);
    await cleanupFixtureUsers(riverbank.id);
  });
});

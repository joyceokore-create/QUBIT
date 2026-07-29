// M18-A governance (docs/18 §1/§7/§10): stage/priority/note edits are audited + evented,
// the gate holds both ways (execs via project:stage, members denied), and the pipeline
// table's note column falls back to the latest confirmed check-in narrative.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { canWriteProject } from "@/lib/access";
import { updateProject } from "@/server/projects";
import { getPortfolioSections, type PortfolioSectionsData } from "@/server/pipeline";
import { confirmCheckIn } from "@/server/checkins";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

describe("M18-A pipeline governance", () => {
  let kcbId: string;
  let leadId: string;
  let memberId: string;
  let projectId: string;
  let leadCtx: TenantContext;

  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    const [lead, member] = await ensureUsers(kcbId, 2);
    leadId = lead.id;
    memberId = member.id;
    leadCtx = { tenantId: kcbId, userId: leadId, roles: ["Member"] };

    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId: kcbId,
          code: `GOV${Date.now() % 100000}`,
          name: "Governance Fixture",
          type: "Project",
          priority: "New",
          status: "OnTrack",
          leadUserId: leadId,
        },
      });
      projectId = project.id;
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      await tx.domainEvent.deleteMany({ where: { type: "project.pipeline_stage_changed" } });
      await tx.checkIn.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("gate both ways (§10): execs and heads hold project:stage; members hold neither path", async () => {
    expect(can({ tenantId: kcbId, userId: "x", roles: ["Executive"] }, "project:stage")).toBe(true);
    expect(can({ tenantId: kcbId, userId: "x", roles: ["HeadOfProjects"] }, "project:stage")).toBe(true);
    expect(can({ tenantId: kcbId, userId: "x", roles: ["HeadOfQA"] }, "project:stage")).toBe(true);
    expect(can({ tenantId: kcbId, userId: memberId, roles: ["Member"] }, "project:stage")).toBe(false);
    expect(await canWriteProject({ tenantId: kcbId, userId: memberId, roles: ["Member"] }, projectId)).toBe(false);
    expect(await canWriteProject(leadCtx, projectId)).toBe(true); // the resource-scoped path
  });

  it("defaults new projects to Exploring; stage change is audited and evented", async () => {
    const before = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { pipelineStage: true } }),
    );
    expect(before.pipelineStage).toBe("Exploring");

    await updateProject(leadCtx, projectId, { pipelineStage: "Evaluating", statusNote: "Business case in review with the vendor." });

    const [row, event, auditRow] = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      Promise.all([
        tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { pipelineStage: true, statusNote: true } }),
        tx.domainEvent.findFirst({ where: { type: "project.pipeline_stage_changed", entityId: projectId } }),
        tx.auditLog.findFirst({ where: { entityType: "project", entityId: projectId, actorId: leadId }, orderBy: { createdAt: "desc" } }),
      ]),
    );
    expect(row.pipelineStage).toBe("Evaluating");
    expect(row.statusNote).toBe("Business case in review with the vendor.");
    expect((event?.payload as { from?: string; to?: string })?.from).toBe("Exploring");
    expect((event?.payload as { from?: string; to?: string })?.to).toBe("Evaluating");
    expect((auditRow?.after as { pipelineStage?: string })?.pipelineStage).toBe("Evaluating");
  });

  it("the pipeline row shows the status note, and falls back to the confirmed check-in narrative", async () => {
    let row = findRow(await getPortfolioSections(leadCtx), projectId)!;
    expect(row.note).toBe("Business case in review with the vendor.");
    expect(row.priority).toBe("New"); // the extended enum round-trips

    // Clear the note; a confirmed check-in narrative takes over (docs/18 §7).
    await updateProject(leadCtx, projectId, { statusNote: null });
    await confirmCheckIn(leadCtx, projectId, { narrative: "Vendor demo went well — moving to scoring." });
    row = findRow(await getPortfolioSections(leadCtx), projectId)!;
    expect(row.note).toBe("Vendor demo went well — moving to scoring.");
    expect(row.unconfirmed).toBe(false);
  });

  it("no legacy priority values survive the DM1.18 backfill in either tenant", async () => {
    for (const slug of ["kcb", "riverbank"]) {
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } });
      const legacy = await withTenant({ tenantId: tenant.id, userId: "test" }, (tx) =>
        tx.project.count({ where: { priority: { in: ["Medium", "Critical"] } } }),
      );
      expect(legacy).toBe(0);
    }
  });
});

function findRow(data: PortfolioSectionsData, id: string) {
  return data.sections.flatMap((s) => s.pipeline.groups.flatMap((g) => g.rows)).find((r) => r.id === id);
}

// M-P3a (docs/34) — the chain's new joints: the member's query rides the draft JSON,
// and a confirmed check-in is SENT to the Head explicitly — with re-confirm resetting
// the stamp so a changed report is never silently substituted.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { confirmCheckIn, listProjectReports, submitCheckInToHead } from "@/server/checkins";
import { saveMyReport, getMyReport } from "@/server/member-reports";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("M-P3a reports chain joints", () => {
  let rbId: string;
  let pmCtx: TenantContext;
  let memberCtx: TenantContext;
  let projectId: string;

  beforeAll(async () => {
    const rb = await prisma.tenant.findUnique({ where: { slug: "riverbank" } });
    if (!rb) throw new Error("Seed required.");
    rbId = rb.id;
    const [pm, member] = await createUsers(rbId, 2, "rpt");
    pmCtx = { tenantId: rbId, userId: pm.id, roles: ["ProjectManager"] };
    memberCtx = { tenantId: rbId, userId: member.id, roles: ["Member"] };
    projectId = (
      await withTenant(pmCtx, (tx) =>
        tx.project.create({
          data: { tenantId: rbId, code: "RPT1", name: "rpt fixture", type: "Project", priority: "Med", status: "OnTrack", leadUserId: pm.id },
          select: { id: true },
        }),
      )
    ).id;
    await withTenant(pmCtx, async (tx) => {
      await tx.projectMember.create({ data: { tenantId: rbId, projectId, userId: memberCtx.userId, role: "Developer" } });
      // Sections exist only where something MOVED this week (docs/18 §5.1) — give the
      // member one completed card so their draft has a section to carry the query.
      await tx.projectTask.create({
        data: {
          tenantId: rbId,
          projectId,
          title: "rpt fixture task",
          type: "Chore",
          priority: "Med",
          status: "Completed",
          approvalStatus: "Published",
          assigneeId: memberCtx.userId,
        },
      });
    });
  });

  afterAll(async () => {
    await withTenant(pmCtx, async (tx) => {
      await tx.checkIn.deleteMany({ where: { projectId } });
      await tx.projectTask.deleteMany({ where: { projectId } });
      await tx.memberReport.deleteMany({ where: { userId: memberCtx.userId } });
      await tx.projectMember.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("the member's query to the PM rides the draft and survives save round-trips", async () => {
    await saveMyReport(memberCtx, {
      notes: { [projectId]: "recon fix pending vendor patch" },
      queries: { [projectId]: "Has the TZ launch date moved? It affects my test plan." },
    });
    const mine = await getMyReport(memberCtx);
    const section = mine.draft.sections.find((s) => s.projectId === projectId);
    expect(section?.query).toContain("TZ launch date");
    expect(section?.note).toContain("vendor patch");

    // Saving only a note leaves the query untouched (partial saves never wipe fields).
    await saveMyReport(memberCtx, { notes: { [projectId]: "updated note" } });
    const again = await getMyReport(memberCtx);
    expect(again.draft.sections.find((s) => s.projectId === projectId)?.query).toContain("TZ launch date");
  });

  it("submit-to-Head requires a confirmed check-in, stamps it, and re-confirm RESETS it", async () => {
    await expect(submitCheckInToHead(pmCtx, projectId)).rejects.toThrow(/Confirm/);

    await confirmCheckIn(pmCtx, projectId, { narrative: "UAT slipped 6 days; vendor fix Thu." });
    const sent = await submitCheckInToHead(pmCtx, projectId);
    expect(sent.submittedToHeadAt).not.toBeNull();

    // The PM edits and re-confirms — the send stamp must clear (never silently swapped).
    await confirmCheckIn(pmCtx, projectId, { narrative: "Vendor fix landed; UAT resumes Mon." });
    const history = await listProjectReports(pmCtx, projectId);
    expect(history[0].submittedToHeadAt).toBeNull();
    expect(history[0].narrative).toContain("resumes Mon");
  });
});

// M-P3a (docs/34) — the chain's joints: the member's query rides the draft JSON, and a
// confirmed check-in reaches the Head. Milestone A made "Confirm & send" ONE act: confirm
// stamps submittedToHeadAt in the same transaction, and a re-confirm RE-SENDS (a newer
// stamp) so a changed report is never silently substituted under the Head.
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
      // This suite runs in riverbank: without this, every Head keeps a fixture
      // "RPT1 sent its week …" notification and the feed keeps fixture events.
      const checkIns = await tx.checkIn.findMany({ where: { projectId }, select: { id: true } });
      const ids = checkIns.map((c) => c.id);
      await tx.domainEvent.deleteMany({ where: { entityType: "check_in", entityId: { in: ids } } });
      await tx.auditLog.deleteMany({ where: { entityType: "check_in", entityId: { in: ids } } });
      await tx.notification.deleteMany({ where: { kind: "checkin.submitted_to_head", message: { contains: "RPT1" } } });
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

  it("confirm sends to the Head in the same act; re-confirm RE-SENDS with a newer stamp", async () => {
    // A never-confirmed week still can't be sent on its own (the legacy re-send door).
    await expect(submitCheckInToHead(pmCtx, projectId)).rejects.toThrow(/Confirm/);

    const T0 = new Date();
    const first = await confirmCheckIn(pmCtx, projectId, { narrative: "UAT slipped 6 days; vendor fix Thu." }, T0);
    expect(first.status).toBe("Confirmed");
    expect(first.submittedToHeadAt).not.toBeNull(); // Milestone A: one act, both stamps

    // The explicit re-send door still works (idempotent re-stamp for legacy rows).
    const resent = await submitCheckInToHead(pmCtx, projectId, new Date(T0.getTime() + 30_000));
    expect(resent.submittedToHeadAt).not.toBeNull();

    // The PM edits and re-confirms — the changed report goes up AGAIN with a newer stamp
    // (never silently swapped under the Head).
    const again = await confirmCheckIn(
      pmCtx,
      projectId,
      { narrative: "Vendor fix landed; UAT resumes Mon." },
      new Date(T0.getTime() + 60_000),
    );
    expect(again.submittedToHeadAt!.getTime()).toBeGreaterThan(first.submittedToHeadAt!.getTime());
    const history = await listProjectReports(pmCtx, projectId);
    expect(history[0].submittedToHeadAt).not.toBeNull();
    expect(history[0].narrative).toContain("resumes Mon");
  });
});

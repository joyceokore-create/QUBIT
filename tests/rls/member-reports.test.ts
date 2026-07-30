// M2-B member weekly reports (docs/18 §5.1 + §10): the draft is built from the member's
// OWN board; submitting routes one report to every involved project's lead; a PM signs
// off only their own project's section; acknowledged sections roll into that project's
// check-in draft. Permission is tested both ways, and nothing crosses a tenant.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { computeCheckInDraft, type CheckInDraft } from "@/server/checkins";
import {
  acknowledgeReport,
  getMyReport,
  listTeamReports,
  saveMyReport,
  submitMyReport,
  MemberReportError,
} from "@/server/member-reports";
import { canAccessReport } from "@/server/q/access";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("M2-B member weekly reports", () => {
  let kcbId: string;
  let memberId: string;
  let pmAId: string;
  let pmBId: string;
  let projectAId: string;
  let projectBId: string;
  let memberCtx: TenantContext;
  let pmACtx: TenantContext;
  let pmBCtx: TenantContext;
  const isoWeek = isoWeekId(new Date());

  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    // Clean users: this suite's assertions depend on the member having NO other project
    // involvement and NO admin permissions (ensureUsers would hand back the super-admin).
    const [member, pmA, pmB] = await createUsers(kcbId, 3, "mr");
    memberId = member.id;
    pmAId = pmA.id;
    pmBId = pmB.id;
    memberCtx = { tenantId: kcbId, userId: memberId, roles: ["Member"] };
    pmACtx = { tenantId: kcbId, userId: pmAId, roles: ["Member"] };
    pmBCtx = { tenantId: kcbId, userId: pmBId, roles: ["Member"] };

    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const now = Date.now();
      const [a, b] = await Promise.all([
        tx.project.create({
          data: { tenantId: kcbId, code: `MRA${now % 100000}`, name: "Report Fixture A", type: "Project", priority: "High", status: "OnTrack", leadUserId: pmAId },
        }),
        tx.project.create({
          data: { tenantId: kcbId, code: `MRB${now % 100000}`, name: "Report Fixture B", type: "Project", priority: "Med", status: "OnTrack", leadUserId: pmBId },
        }),
      ]);
      projectAId = a.id;
      projectBId = b.id;
      await tx.projectMember.createMany({
        data: [
          { tenantId: kcbId, projectId: projectAId, userId: memberId, role: "Developer" },
          { tenantId: kcbId, projectId: projectBId, userId: memberId, role: "Developer" },
        ],
      });
      // The member's own week: one finished on A, one still running on B.
      await tx.projectTask.createMany({
        data: [
          { tenantId: kcbId, projectId: projectAId, title: "Ship export endpoint", type: "Feature", status: "Completed", approvalStatus: "Published", assigneeId: memberId },
          { tenantId: kcbId, projectId: projectBId, title: "Wire settlement retry", type: "Feature", status: "InProgress", approvalStatus: "Published", assigneeId: memberId },
          // Somebody else's card on A — must never appear in the member's report.
          { tenantId: kcbId, projectId: projectAId, title: "Not my work", type: "Feature", status: "InProgress", approvalStatus: "Published", assigneeId: pmAId },
        ],
      });
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      await tx.memberReport.deleteMany({ where: { userId: memberId } }); // acks cascade
      await tx.project.deleteMany({ where: { id: { in: [projectAId, projectBId] } } });
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("drafts from the member's OWN board — one section per project that moved", async () => {
    const mine = await getMyReport(memberCtx);
    expect(mine.status).toBe("Draft");
    expect(mine.id).toBeNull(); // computed, not yet persisted
    const sections = mine.draft.sections;
    expect(sections.map((s) => s.projectId).sort()).toEqual([projectAId, projectBId].sort());

    const a = sections.find((s) => s.projectId === projectAId)!;
    expect(a.done.map((d) => d.title)).toEqual(["Ship export endpoint"]);
    // Another person's card on the same project never leaks in.
    expect([...a.done, ...a.doing].map((t) => t.title)).not.toContain("Not my work");
    const b = sections.find((s) => s.projectId === projectBId)!;
    expect(b.doing.map((d) => d.title)).toEqual(["Wire settlement retry"]);
  });

  it("saves the member's edits without letting the client rewrite the facts", async () => {
    const saved = await saveMyReport(memberCtx, {
      narrative: "Vendor call moved to Monday.",
      notes: { [projectAId]: "Export endpoint needs a load test before go-live." },
    });
    expect(saved.narrative).toBe("Vendor call moved to Monday.");
    const a = saved.draft.sections.find((s) => s.projectId === projectAId)!;
    expect(a.note).toBe("Export endpoint needs a load test before go-live.");
    expect(a.done.map((d) => d.title)).toEqual(["Ship export endpoint"]); // facts intact
  });

  it("submits ONE report that routes to every involved project's lead (§5.1.3)", async () => {
    const submitted = await submitMyReport(memberCtx);
    expect(submitted.status).toBe("Submitted");
    expect(submitted.submittedAt).not.toBeNull();

    // Each PM sees only their own project's section.
    const [teamA, teamB] = await Promise.all([listTeamReports(pmACtx), listTeamReports(pmBCtx)]);
    const rowA = teamA.find((r) => r.userId === memberId)!;
    const rowB = teamB.find((r) => r.userId === memberId)!;
    expect(rowA.sections.map((s) => s.projectId)).toEqual([projectAId]);
    expect(rowB.sections.map((s) => s.projectId)).toEqual([projectBId]);
    // The member's own words reach the lead — the edit step would be pointless otherwise.
    expect(rowA.narrative).toBe("Vendor call moved to Monday.");
    expect(rowA.sections[0].note).toContain("load test");

    // Both leads were notified; the submitter never notifies themselves.
    const notes = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.notification.findMany({ where: { kind: "member_report" }, select: { userId: true } }),
    );
    const notified = new Set(notes.map((n) => n.userId));
    expect(notified.has(pmAId)).toBe(true);
    expect(notified.has(pmBId)).toBe(true);
    expect(notified.has(memberId)).toBe(false);

    // Re-submitting is refused rather than silently duplicating.
    await expect(submitMyReport(memberCtx)).rejects.toThrowError(MemberReportError);
  });

  it("a PM acknowledges ONLY their own project's section (§5.1.4), audited", async () => {
    const row = (await listTeamReports(pmACtx)).find((r) => r.userId === memberId)!;
    // PM of A cannot sign off B's section.
    await expect(acknowledgeReport(pmACtx, row.id, { projectId: projectBId })).rejects.toThrowError(MemberReportError);

    await acknowledgeReport(pmACtx, row.id, { projectId: projectAId, comment: "Thanks — load test noted." });

    const [after, audit] = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      Promise.all([
        tx.memberReport.findFirstOrThrow({ where: { userId: memberId, isoWeek }, select: { status: true, acks: { select: { projectId: true } } } }),
        tx.auditLog.findFirst({ where: { entityType: "member_report", actorId: pmAId }, orderBy: { createdAt: "desc" } }),
      ]),
    );
    expect(after.acks.map((a) => a.projectId)).toEqual([projectAId]);
    // Still Submitted — B's section is unacknowledged, so the report isn't complete.
    expect(after.status).toBe("Submitted");
    expect((audit?.after as { acknowledgedProject?: string })?.acknowledgedProject).toBe(projectAId);

    // Once every section is signed off, the report reads Acknowledged.
    const rowB = (await listTeamReports(pmBCtx)).find((r) => r.userId === memberId)!;
    await acknowledgeReport(pmBCtx, rowB.id, { projectId: projectBId });
    const done = await getMyReport(memberCtx);
    expect(done.status).toBe("Acknowledged");
    expect(done.acks.map((a) => a.projectId).sort()).toEqual([projectAId, projectBId].sort());
  });

  it("acknowledged sections roll into that project's check-in draft (§5.1.4)", async () => {
    const draft = await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const { draft } = await computeCheckInDraft(tx, projectAId);
      return draft as CheckInDraft;
    });
    const joined = draft.lines.join(" | ");
    expect(joined).toContain("1 item completed");
    expect(joined).toContain("Export endpoint needs a load test");
  });

  it("§10 permission both ways: anyone reads portfolio status, nobody pulls another's report", async () => {
    // R1/portfolio status is globally readable…
    expect(await canAccessReport(memberCtx, "portfolio")).toBe(true);
    expect(await canAccessReport(memberCtx, "project", projectAId)).toBe(true);
    // …but a developer cannot pull a colleague's person report.
    expect(await canAccessReport(memberCtx, "resource", pmBId)).toBe(false);
    expect(await canAccessReport(memberCtx, "resource", memberId)).toBe(true); // self is fine
    // A non-lead sees no team reports at all.
    expect(await listTeamReports(memberCtx)).toEqual([]);
  });

  it("RLS: another tenant sees none of this report", async () => {
    const riverbank = await prisma.tenant.findUniqueOrThrow({ where: { slug: "riverbank" } });
    const [rvUser] = await createUsers(riverbank.id, 1, "mrrv");
    const rvCtx = { tenantId: riverbank.id, userId: rvUser.id, roles: ["Member"] };
    const team = await listTeamReports(rvCtx);
    expect(team.some((r) => r.userId === memberId)).toBe(false);
    const mine = await getMyReport(rvCtx);
    expect(mine.draft.sections.some((s) => [projectAId, projectBId].includes(s.projectId))).toBe(false);
    await cleanupFixtureUsers(riverbank.id);
  });
});

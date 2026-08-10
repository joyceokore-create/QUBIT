// The WHOLE reporting chain in one pass, with a real delivery team on one project:
// dev + QA + implementor each auto-draft a weekly update from their board activity,
// edit it, raise a query, and submit → the PM sees all three, acknowledges them, and
// their acknowledged lines feed the project check-in → PM confirms and SENDS to the
// Head → the Head builds and approves the roll-up → the executive reads what was signed.
//
// The existing reports-chain.test.ts pins two joints in isolation; this one proves the
// rungs connect, which is the thing that actually breaks when an engine changes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  acknowledgeReport,
  getMyReport,
  listTeamReports,
  saveMyReport,
  submitMyReport,
} from "@/server/member-reports";
import { confirmCheckIn, getCurrentCheckIn, submitCheckInToHead } from "@/server/checkins";
import { approveRollup, buildRollup, getApprovedRollup, getRollup } from "@/server/portfolio-reports";
import { createUsers, cleanupFixtureUsers } from "./_users";

// A week nobody else's suite touches, so the roll-up here never collides.
const NOW = new Date("2027-06-09T10:00:00.000Z"); // 2027-W23
const WEEK = "2027-W23";

describe("reporting chain end to end", () => {
  let rbId: string;
  let projectId: string;
  let pmCtx: TenantContext;
  let headCtx: TenantContext;
  let devCtx: TenantContext;
  let qaCtx: TenantContext;
  let implCtx: TenantContext;

  beforeAll(async () => {
    const rb = await prisma.tenant.findUnique({ where: { slug: "riverbank" } });
    if (!rb) throw new Error("Seed required.");
    rbId = rb.id;
    const [pm, head, dev, qa, impl] = await createUsers(rbId, 5, "e2e");
    pmCtx = { tenantId: rbId, userId: pm.id, roles: ["ProjectManager"] };
    headCtx = { tenantId: rbId, userId: head.id, roles: ["HeadOfProjects"] };
    devCtx = { tenantId: rbId, userId: dev.id, roles: ["Member"] };
    qaCtx = { tenantId: rbId, userId: qa.id, roles: ["Member"] };
    implCtx = { tenantId: rbId, userId: impl.id, roles: ["Member"] };

    await withTenant(pmCtx, async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId: rbId, code: "E2E1", name: "e2e chain fixture", type: "Project",
          priority: "Med", status: "OnTrack", leadUserId: pm.id,
        },
        select: { id: true },
      });
      projectId = project.id;
      const team: [string, string][] = [[dev.id, "Developer"], [qa.id, "QA Engineer"], [impl.id, "Implementor"]];
      for (const [userId, role] of team) {
        await tx.projectMember.create({ data: { tenantId: rbId, projectId, userId, role } });
        // One completed + one in-flight card each, so the auto-draft has real facts.
        // Sections only appear where something MOVED this week (docs/18 §5.1).
        await tx.projectTask.create({
          data: { tenantId: rbId, projectId, title: `e2e done ${role}`, type: "Chore", priority: "Med",
                  status: "Completed", approvalStatus: "Published", assigneeId: userId, lastActivityAt: NOW },
        });
        await tx.projectTask.create({
          data: { tenantId: rbId, projectId, title: `e2e doing ${role}`, type: "Chore", priority: "Med",
                  status: "InProgress", approvalStatus: "Published", assigneeId: userId, lastActivityAt: NOW },
        });
      }
      // "Done this week" is judged on updatedAt (member-reports.ts), which Prisma stamps
      // to the real clock — but this fixture deliberately lives in a far-future week so
      // its roll-up cannot collide with live data. Pin updated_at into that week.
      await tx.$executeRaw`UPDATE project_task SET updated_at = ${NOW} WHERE project_id = ${projectId}`;
    });
  });

  afterAll(async () => {
    await withTenant(pmCtx, async (tx) => {
      await tx.portfolioReport.deleteMany({ where: { isoWeek: WEEK } });
      await tx.memberReportAck.deleteMany({ where: { projectId } });
      await tx.memberReport.deleteMany({ where: { userId: { in: [devCtx.userId, qaCtx.userId, implCtx.userId] } } });
      await tx.checkIn.deleteMany({ where: { projectId } });
      await tx.projectTask.deleteMany({ where: { projectId } });
      await tx.projectMember.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("rung 1 — each member's week auto-drafts from their own board, and they own the edit", async () => {
    for (const [ctx, who] of [[devCtx, "dev"], [qaCtx, "qa"], [implCtx, "impl"]] as const) {
      const mine = await getMyReport(ctx, NOW);
      expect(mine.status).toBe("Draft");
      const section = mine.draft.sections?.find((s) => s.projectId === projectId);
      expect(section, `${who} should have a section for the project`).toBeTruthy();
      // The draft states what moved — it is not an empty form.
      expect(section!.lines.join(" ")).toMatch(/Completed 1 item/);
      expect(section!.done).toHaveLength(1);
      expect(section!.doing).toHaveLength(1);
    }
  });

  it("rung 2 — a member edits, raises a query to the PM, and submits", async () => {
    await saveMyReport(
      devCtx,
      { narrative: "Settlement client landed.", notes: { [projectId]: "Retry backoff still open." }, queries: { [projectId]: "Cap retries at 3 or 5?" } },
      NOW,
    );
    const submitted = await submitMyReport(devCtx, NOW);
    expect(submitted.status).toBe("Submitted");
    // The query survives the submit — it is what the PM must answer.
    expect(submitted.draft.sections?.find((s) => s.projectId === projectId)?.query).toBe("Cap retries at 3 or 5?");

    await saveMyReport(qaCtx, { narrative: "Regression pack green.", notes: {}, queries: {} }, NOW);
    await submitMyReport(qaCtx, NOW);
    await saveMyReport(implCtx, { narrative: "Rollout checklist drafted.", notes: {}, queries: {} }, NOW);
    await submitMyReport(implCtx, NOW);
  });

  it("rung 3 — the PM sees all three and acknowledges them", async () => {
    // Each row is one MEMBER's report, carrying only the sections for projects this PM
    // leads (§5.1.3) — so three submitters means three rows, each pending on this project.
    const waiting = (await listTeamReports(pmCtx, NOW)).filter((r) => r.sections.some((s) => s.projectId === projectId));
    expect(waiting).toHaveLength(3);
    expect(waiting.every((r) => r.pendingProjectIds.includes(projectId))).toBe(true);
    // The dev's query reached the PM — it is what they must answer.
    expect(waiting.flatMap((r) => r.sections).some((s) => s.query === "Cap retries at 3 or 5?")).toBe(true);

    for (const r of waiting) {
      await acknowledgeReport(pmCtx, r.id, { projectId, comment: "Noted — capping at 3." }, NOW);
    }
    const stillPending = (await listTeamReports(pmCtx, NOW)).filter((r) => r.pendingProjectIds.includes(projectId));
    expect(stillPending).toHaveLength(0);
  });

  it("rung 4 — acknowledged updates feed the check-in, which the PM confirms and sends", async () => {
    const draft = await getCurrentCheckIn(pmCtx, projectId, NOW);
    expect(draft.status).toBe("Draft");
    // The computed draft carries the team's acknowledged lines — the PM narrates, never
    // retypes the facts.
    expect(draft.lines.length).toBeGreaterThan(0);
    // The team's acknowledged work is IN those computed lines — the PM narrates, never
    // retypes the facts.
    expect(draft.lines.join(" ")).toMatch(/e2e|complet|item/i);

    await confirmCheckIn(pmCtx, projectId, { narrative: "Settlement client landed; QA pack green." }, NOW);
    await submitCheckInToHead(pmCtx, projectId, NOW);
    const sent = await getCurrentCheckIn(pmCtx, projectId, NOW);
    expect(sent.status).toBe("Confirmed");
    expect(sent.submittedToHeadAt).not.toBeNull();
  });

  it("rung 5 — the Head sees it in the roll-up, approves, and the exec reads what was signed", async () => {
    const draft = await buildRollup(headCtx, NOW);
    const row = draft.rows.find((r) => r.code === "E2E1");
    expect(row?.checkIn).toBe("Confirmed");
    expect(row?.submittedToHead).toBe(true);
    expect(row?.narrative).toContain("Settlement client landed");

    const approved = await approveRollup(headCtx, "Week held steady across delivery.", NOW);
    expect(approved.status).toBe("Approved");

    // What the executive reads is the SIGNED copy, and it no longer moves.
    const hero = await getApprovedRollup(headCtx, NOW);
    expect(hero?.narrative).toContain("Week held steady");
    await confirmCheckIn(pmCtx, projectId, { narrative: "changed after signing" }, NOW);
    const frozen = await getRollup(headCtx, NOW);
    expect(frozen.rows.find((r) => r.code === "E2E1")?.narrative).toContain("Settlement client landed");
  });
});

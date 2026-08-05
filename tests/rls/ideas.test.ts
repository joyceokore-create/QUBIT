// M-P4a (docs/35 §1) — idea intake & triage: submitting is universal and notifies the
// Head; park REQUIRES a reason; accept links idea↔project inside ONE transaction (and
// rolls both back on failure); a non-head cannot triage; a submitter sees only their own;
// tenant B is blind.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  getIdeaBoard,
  getIdeaForPrefill,
  listProjectIdeaProvenance,
  mergeIdea,
  parkIdea,
  setIdeaReviewing,
  submitIdea,
} from "@/server/ideas";
import { createProjectFromWizard } from "@/server/project-wizard";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("M-P4a idea intake & triage", () => {
  let rbId: string;
  let dbId: string;
  let headCtx: TenantContext;
  let memberCtx: TenantContext;
  let otherCtx: TenantContext;
  let portfolioId: string;
  let mergeTargetId: string;
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [head, member, other] = await createUsers(rbId, 3, "idea");
    headCtx = { tenantId: rbId, userId: head.id, roles: ["HeadOfProjects"] };
    memberCtx = { tenantId: rbId, userId: member.id, roles: ["Member"] };
    otherCtx = { tenantId: rbId, userId: other.id, roles: ["Member"] };
    await withTenant(headCtx, async (tx) => {
      // The Head must hold a role_assignment row to be notified (ctx.roles is the session,
      // the outbox reads the table).
      await tx.roleAssignment.create({ data: { tenantId: rbId, userId: head.id, role: "HeadOfProjects" } });
      portfolioId = (
        await tx.portfolio.create({
          data: { tenantId: rbId, name: "idea fixture portfolio", viewKind: "Pipeline" },
          select: { id: true },
        })
      ).id;
      mergeTargetId = (
        await tx.project.create({
          data: { tenantId: rbId, code: "IDEAM", name: "idea merge target", type: "Project", priority: "Med", status: "OnTrack" },
          select: { id: true },
        })
      ).id;
    });
  });

  afterAll(async () => {
    await withTenant(headCtx, async (tx) => {
      await tx.idea.deleteMany({ where: { sponsor: { startsWith: "fixture sponsor" } } });
      const ids = [...createdProjectIds, mergeTargetId];
      await tx.projectMember.deleteMany({ where: { projectId: { in: ids } } });
      await tx.projectOrgStatus.deleteMany({ where: { projectId: { in: ids } } });
      await tx.project.deleteMany({ where: { id: { in: ids } } });
      await tx.portfolio.deleteMany({ where: { id: portfolioId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  const submit = (ctx: TenantContext, title: string) =>
    submitIdea(ctx, {
      title,
      sponsor: "fixture sponsor A",
      problem: "A problem long enough to satisfy the validator.",
      expectedValue: "some value",
      suggestedPortfolioId: portfolioId,
    });

  it("anyone submits; the Head is notified", async () => {
    const idea = await submit(memberCtx, "member idea one");
    expect(idea.status).toBe("New");
    expect(idea.mine).toBe(true);
    expect(idea.suggestedPortfolio?.id).toBe(portfolioId);
    // Not summarised is NULL, never an invented line (docs/35 §3).
    expect(idea.summary).toBeNull();

    const note = await withTenant(headCtx, (tx) =>
      tx.notification.findFirst({ where: { userId: headCtx.userId, kind: "idea.submitted" } }),
    );
    expect(note?.message).toContain("member idea one");
  });

  it("a submitter sees only their own; the Head sees the whole queue", async () => {
    await submit(otherCtx, "other idea one");

    const mine = await getIdeaBoard(memberCtx);
    expect(mine.canTriage).toBe(false);
    const myTitles = mine.lanes.flatMap((l) => l.ideas.map((i) => i.title));
    expect(myTitles).toContain("member idea one");
    expect(myTitles).not.toContain("other idea one"); // scoping, not RLS

    const board = await getIdeaBoard(headCtx);
    expect(board.canTriage).toBe(true);
    const allTitles = board.lanes.flatMap((l) => l.ideas.map((i) => i.title));
    expect(allTitles).toContain("member idea one");
    expect(allTitles).toContain("other idea one");
  });

  it("a non-head cannot triage — park, merge and the lane move all refuse", async () => {
    const idea = await submit(memberCtx, "member idea to guard");
    await expect(parkIdea(memberCtx, idea.id, "not allowed")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(mergeIdea(memberCtx, idea.id, mergeTargetId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setIdeaReviewing(memberCtx, idea.id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // …and a member never gets wizard prefill, even for a real open idea.
    expect(await getIdeaForPrefill(memberCtx, idea.id)).toBeNull();
  });

  it("park requires a reason, keeps the idea, and tells the submitter why", async () => {
    const idea = await submit(memberCtx, "member idea to park");
    await expect(parkIdea(headCtx, idea.id, "  no ")).rejects.toMatchObject({ code: "REASON_REQUIRED" });

    const parked = await parkIdea(headCtx, idea.id, "Wrong quarter — revisit after the FAL migration.");
    expect(parked.status).toBe("Parked");
    expect(parked.parkReason).toContain("Wrong quarter");
    // Never deleted: the row is still readable.
    const still = await withTenant(headCtx, (tx) => tx.idea.findUnique({ where: { id: idea.id } }));
    expect(still).not.toBeNull();
    // A decided idea cannot be re-decided.
    await expect(parkIdea(headCtx, idea.id, "again for good measure")).rejects.toMatchObject({ code: "ALREADY_DECIDED" });

    const note = await withTenant(headCtx, (tx) =>
      tx.notification.findFirst({ where: { userId: memberCtx.userId, kind: "idea.parked" } }),
    );
    expect(note?.message).toContain("was parked");
  });

  it("merge records provenance on the receiving project", async () => {
    const idea = await submit(memberCtx, "member idea to merge");
    const merged = await mergeIdea(headCtx, idea.id, mergeTargetId);
    expect(merged.status).toBe("Merged");
    expect(merged.outcomeProject?.id).toBe(mergeTargetId);

    const prov = await listProjectIdeaProvenance(headCtx, mergeTargetId);
    expect(prov.find((p) => p.title === "member idea to merge")?.kind).toBe("merged");
  });

  it("accept links idea↔project in ONE transaction — and rolls back together on failure", async () => {
    const idea = await submit(memberCtx, "member idea to accept");
    // The Head may prefill from an open idea.
    const prefill = await getIdeaForPrefill(headCtx, idea.id);
    expect(prefill?.title).toBe("member idea to accept");
    expect(prefill?.suggestedPortfolioId).toBe(portfolioId);

    // Failure path FIRST: a bad market id aborts the wizard transaction, so the idea must
    // still be open afterwards — no half-accepted idea pointing at a project that never
    // existed.
    await expect(
      createProjectFromWizard(headCtx, {
        name: "idea rollback project",
        portfolioId,
        pipelineStage: "Exploring",
        marketIds: ["00000000-0000-0000-0000-000000000000"],
        team: [],
        acceptedWarnings: [],
        fromIdeaId: idea.id,
      }),
    ).rejects.toMatchObject({ code: "BAD_MARKET" });
    const afterFailure = await withTenant(headCtx, (tx) =>
      tx.idea.findUniqueOrThrow({ where: { id: idea.id }, select: { status: true, acceptedProjectId: true } }),
    );
    expect(afterFailure.status).toBe("New");
    expect(afterFailure.acceptedProjectId).toBeNull();

    // Success path.
    const project = await createProjectFromWizard(headCtx, {
      name: "idea accepted project",
      portfolioId,
      pipelineStage: "Exploring",
      marketIds: [],
      team: [],
      acceptedWarnings: [],
      fromIdeaId: idea.id,
    });
    createdProjectIds.push(project.id);
    const accepted = await withTenant(headCtx, (tx) =>
      tx.idea.findUniqueOrThrow({ where: { id: idea.id }, select: { status: true, acceptedProjectId: true, triagedById: true } }),
    );
    expect(accepted.status).toBe("Accepted");
    expect(accepted.acceptedProjectId).toBe(project.id);
    expect(accepted.triagedById).toBe(headCtx.userId);
    expect(project.pipelineStage).toBe("Exploring");

    const prov = await listProjectIdeaProvenance(headCtx, project.id);
    expect(prov[0]?.kind).toBe("accepted");
    // The submitter learns their idea became a project.
    const note = await withTenant(headCtx, (tx) =>
      tx.notification.findFirst({ where: { userId: memberCtx.userId, kind: "idea.accepted" } }),
    );
    expect(note?.message).toContain("is now a project");
    // A prefill request for a decided idea yields null — the wizard can't re-accept it.
    expect(await getIdeaForPrefill(headCtx, idea.id)).toBeNull();
  });

  it("the lane move works both ways for the Head", async () => {
    const idea = await submit(memberCtx, "member idea to review");
    expect((await setIdeaReviewing(headCtx, idea.id, true)).status).toBe("Reviewing");
    expect((await setIdeaReviewing(headCtx, idea.id, false)).status).toBe("New");
  });

  it("tenant B sees no ideas", async () => {
    const dbCtx: TenantContext = { tenantId: dbId, userId: "test", roles: ["HeadOfProjects"] };
    const board = await getIdeaBoard(dbCtx);
    const titles = [...board.lanes.flatMap((l) => l.ideas.map((i) => i.title)), ...board.decided.map((i) => i.title)];
    expect(titles.some((t) => t.startsWith("member idea"))).toBe(false);
  });
});

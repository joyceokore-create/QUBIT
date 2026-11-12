// UX10 (D8b) — the Portfolios initiatives read. Requires a migrated, seeded DB.
// Counts never include the other tenant; the Inactive vs active split (Paused, Cancelled,
// Shelved portfolio); ideas follow getIdeaBoard's rule (triager: all, else own); the change
// lines read only this tenant's stage snapshots and stay hidden until 28 days exist.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getInitiatives } from "@/server/initiatives";
import { lifecycleCards, rowsForTab } from "@/lib/initiatives";
import { createUsers, cleanupFixtureUsers } from "./_users";

const DAY = 86_400_000;
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

describe("UX10 Portfolios initiatives", () => {
  const now = new Date();
  let rbId: string;
  let bId: string;
  let head: TenantContext;
  let member: TenantContext;
  let bHead: TenantContext;
  const rbProjects: Record<string, string> = {};
  let rbPortfolios: string[] = [];
  let rbIdeas: string[] = [];
  let bProject: string;
  let bIdea: string;
  let bPortfolio: string;

  beforeAll(async () => {
    const [rb, b] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !b) throw new Error("Seed required.");
    rbId = rb.id;
    bId = b.id;
    const [[h, m], [bh]] = await Promise.all([createUsers(rbId, 2, "initiatives"), createUsers(bId, 1, "initiatives")]);
    head = { tenantId: rbId, userId: h.id, roles: ["HeadOfProjects"] };
    member = { tenantId: rbId, userId: m.id, roles: ["Member"] };
    bHead = { tenantId: bId, userId: bh.id, roles: ["HeadOfProjects"] };

    await withTenant(head, async (tx) => {
      const live = await tx.portfolio.create({ data: { tenantId: rbId, name: "UX10 fixture approved", category: "Approved" }, select: { id: true } });
      const shelved = await tx.portfolio.create({ data: { tenantId: rbId, name: "UX10 fixture shelved", category: "Shelved" }, select: { id: true } });
      rbPortfolios = [live.id, shelved.id];
      const mk = async (key: string, data: { status: string; pipelineStage: string; priority?: string; portfolioId?: string; stageEnteredAt?: Date | null }) => {
        const p = await tx.project.create({
          data: { tenantId: rbId, code: `UXT${key}`, name: `UX10 fixture ${key}`, type: "Project", priority: data.priority ?? "Med", status: data.status, pipelineStage: data.pipelineStage, portfolioId: data.portfolioId ?? live.id, stageEnteredAt: data.stageEnteredAt },
          select: { id: true },
        });
        rbProjects[key] = p.id;
      };
      await mk("EXP", { status: "OnTrack", pipelineStage: "Exploring", stageEnteredAt: new Date(now.getTime() - 40 * DAY) });
      await mk("APR", { status: "OnTrack", pipelineStage: "Approved" });
      await mk("LIVE", { status: "Completed", pipelineStage: "Approved" });
      await mk("PAUSE", { status: "OnTrack", pipelineStage: "Paused" });
      await mk("CANC", { status: "Cancelled", pipelineStage: "Approved" });
      await mk("SHELF", { status: "OnTrack", pipelineStage: "Evaluating", portfolioId: shelved.id });
      await mk("UNK", { status: "OnTrack", pipelineStage: "Evaluating", stageEnteredAt: null });

      const idea = (title: string, submittedById: string, status = "New") =>
        tx.idea.create({ data: { tenantId: rbId, title, sponsor: "user_001", problem: "A synthetic problem statement.", submittedById, status }, select: { id: true } });
      rbIdeas = [
        (await idea("UX10 fixture head idea", h.id)).id,
        (await idea("UX10 fixture member idea", m.id, "Reviewing")).id,
        (await idea("UX10 fixture parked idea", m.id, "Parked")).id,
      ];
    });

    ({ bProject, bIdea, bPortfolio } = await withTenant(bHead, async (tx) => {
      const pf = await tx.portfolio.create({ data: { tenantId: bId, name: "UX10 fixture B", category: "Approved" }, select: { id: true } });
      const p = await tx.project.create({
        data: { tenantId: bId, code: "UXTB1", name: "UX10 fixture B project", type: "Project", priority: "Med", status: "OnTrack", pipelineStage: "Evaluating", portfolioId: pf.id },
        select: { id: true },
      });
      const i = await tx.idea.create({ data: { tenantId: bId, title: "UX10 fixture B idea", sponsor: "user_002", problem: "A synthetic problem statement.", submittedById: bh.id }, select: { id: true } });
      return { bProject: p.id, bIdea: i.id, bPortfolio: pf.id };
    }));
  });

  afterAll(async () => {
    await withTenant(head, async (tx) => {
      await tx.idea.deleteMany({ where: { id: { in: rbIdeas } } });
      await tx.project.deleteMany({ where: { id: { in: Object.values(rbProjects) } } });
      await tx.portfolio.deleteMany({ where: { id: { in: rbPortfolios } } });
    });
    await withTenant(bHead, async (tx) => {
      await tx.idea.deleteMany({ where: { id: bIdea } });
      await tx.project.deleteMany({ where: { id: bProject } });
      await tx.portfolio.deleteMany({ where: { id: bPortfolio } });
    });
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  it("RLS: never includes the other tenant's projects, ideas or portfolios", async () => {
    const rb = await getInitiatives(head, now);
    const ids = new Set(rb.rows.map((r) => r.id));
    expect(ids.has(bProject)).toBe(false);
    expect(ids.has(bIdea)).toBe(false);
    expect(rb.rows.some((r) => r.portfolio?.id === bPortfolio)).toBe(false);

    const b = await getInitiatives(bHead, now);
    const bIds = new Set(b.rows.map((r) => r.id));
    expect(bIds.has(bProject)).toBe(true);
    expect(bIds.has(bIdea)).toBe(true);
    for (const id of [...Object.values(rbProjects), ...rbIdeas]) expect(bIds.has(id)).toBe(false);
  });

  it("splits Inactive (paused, cancelled, shelved portfolio) from the active stages", async () => {
    const { rows } = await getInitiatives(head, now);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(rbProjects.EXP)).toMatchObject({ stage: "Exploring", inactiveReason: null });
    expect(byId.get(rbProjects.APR)).toMatchObject({ stage: "Approved", health: "None" });
    expect(byId.get(rbProjects.LIVE)).toMatchObject({ stage: "Live", health: null });
    expect(byId.get(rbProjects.PAUSE)).toMatchObject({ stage: "Inactive", inactiveReason: "Paused" });
    expect(byId.get(rbProjects.CANC)).toMatchObject({ stage: "Inactive", inactiveReason: "Cancelled" });
    expect(byId.get(rbProjects.SHELF)).toMatchObject({ stage: "Inactive", inactiveReason: "Shelved" });
    expect(byId.get(rbProjects.UNK)).toMatchObject({ stage: "Evaluating", stageEnteredAt: null });

    // The five cards plus Inactive add up to All on real data.
    const cards = lifecycleCards(rows, now, "Africa/Nairobi", { ready: false, weekAgo: null });
    expect(cards.reduce((a, c) => a + c.count, 0) + rowsForTab(rows, "inactive").length).toBe(rows.length);
  });

  it("ideas: open ones are Intake; a triager sees all, a member only their own; parked never shows", async () => {
    const [h, m] = await Promise.all([getInitiatives(head, now), getInitiatives(member, now)]);
    const hIds = new Set(h.rows.filter((r) => r.kind === "idea").map((r) => r.id));
    const mIdeas = m.rows.filter((r) => r.kind === "idea");
    expect(hIds.has(rbIdeas[0]) && hIds.has(rbIdeas[1])).toBe(true);
    expect(hIds.has(rbIdeas[2])).toBe(false);
    expect(mIdeas.map((r) => r.id)).toEqual([rbIdeas[1]]);
    expect(mIdeas[0].stage).toBe("Intake");
    // Projects are read-all for everyone.
    expect(m.rows.some((r) => r.id === rbProjects.EXP)).toBe(true);
  });

  it("change lines: hidden under 28 days of stage history; once ready, counts only this tenant's snapshots", async () => {
    const today = utcDay(now);
    const snap = (tenantId: string, projectId: string, day: Date, stage: string) => ({
      tenantId, projectId, day, stage, status: "OnTrack", rag: "Green", progress: 0, tasksOpen: 0, tasksCompleted: 0, tasksOverdue: 0, blockersOpen: 0, risksOpen: 0,
    });
    // Riverbank: plenty of Evaluating history a week ago (fixture projects only).
    await withTenant(head, (tx) =>
      tx.projectSnapshot.createMany({
        data: [rbProjects.EXP, rbProjects.APR, rbProjects.UNK].flatMap((id) => [snap(rbId, id, new Date(today.getTime() - 40 * DAY), "Evaluating"), snap(rbId, id, new Date(today.getTime() - 7 * DAY), "Evaluating")]),
        skipDuplicates: true,
      }),
    );

    // Tenant B with only 10 days of history: no change lines.
    await withTenant(bHead, (tx) => tx.projectSnapshot.create({ data: snap(bId, bProject, new Date(today.getTime() - 10 * DAY), "Evaluating") }));
    const bEarliest = await withTenant(bHead, (tx) => tx.projectSnapshot.findFirst({ where: { stage: { not: null } }, orderBy: { day: "asc" }, select: { day: true } }));
    const short = await getInitiatives(bHead, now);
    if (bEarliest && bEarliest.day.getTime() > today.getTime() - 28 * DAY) {
      expect(short.history).toEqual({ ready: false, weekAgo: null });
      expect(lifecycleCards(short.rows, now, "Africa/Nairobi", short.history).every((c) => c.change === null)).toBe(true);
    }

    // Give B 30 days of history: ready, and its counts never include Riverbank's rows.
    await withTenant(bHead, (tx) => tx.projectSnapshot.create({ data: snap(bId, bProject, new Date(today.getTime() - 30 * DAY), "Evaluating") }));
    const b = await getInitiatives(bHead, now);
    expect(b.history.ready).toBe(true);
    const expected = await withTenant(bHead, async (tx) => {
      const ref = await tx.projectSnapshot.findFirst({ where: { stage: { not: null }, day: { lte: new Date(today.getTime() - 7 * DAY) } }, orderBy: { day: "desc" }, select: { day: true } });
      return ref ? tx.projectSnapshot.count({ where: { day: ref.day, stage: "Evaluating" } }) : 0;
    });
    expect(b.history.weekAgo?.Evaluating).toBe(expected);
    // Riverbank's snapshot rows are invisible under B's context.
    expect(await withTenant(bHead, (tx) => tx.projectSnapshot.count({ where: { projectId: { in: Object.values(rbProjects) } } }))).toBe(0);

    const rb = await getInitiatives(head, now);
    expect(rb.history.ready).toBe(true);
    expect(rb.history.weekAgo?.Evaluating).toBeGreaterThanOrEqual(3);
  });
});

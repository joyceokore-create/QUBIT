// M18-B (amended docs/18 §0.5/§3.0/§6/§10): every project belongs to a portfolio, the
// dashboard groups by portfolio worst-health-first with Unassigned last (and only when
// non-empty), a portfolio move is a normal audited governance edit, and none of it
// leaks across tenants.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createProject, updateProject, ProjectError } from "@/server/projects";
import { getPortfolioSections, type PortfolioSection } from "@/server/pipeline";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

const ragRank = (r: PortfolioSection["rag"]) => (r === "Red" ? 0 : r === "Amber" ? 1 : 2);

describe("M18-B portfolio-grouped sections", () => {
  let demoBId: string;
  let riverbankId: string;
  let leadId: string;
  let ctx: TenantContext;
  let rvCtx: TenantContext;
  let fixturePortfolioId: string;
  let redProjectId: string;
  let createdProjectId: string;

  beforeAll(async () => {
    const [demoB, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!demoB || !riverbank) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    demoBId = demoB.id;
    riverbankId = riverbank.id;
    const [lead] = await ensureUsers(demoBId, 1);
    leadId = lead.id;
    ctx = { tenantId: demoBId, userId: leadId, roles: ["Member"] };
    const [rvUser] = await ensureUsers(riverbankId, 1);
    rvCtx = { tenantId: riverbankId, userId: rvUser.id, roles: ["Member"] };

    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      const portfolio = await tx.portfolio.create({
        data: { tenantId: demoBId, name: "ZZZ Sections Fixture", viewKind: "Rollout" },
      });
      fixturePortfolioId = portfolio.id;
      const red = await tx.project.create({
        data: {
          tenantId: demoBId,
          code: `SEC${Date.now() % 100000}`,
          name: "Sections Red Fixture",
          type: "Project",
          priority: "High",
          status: "Overdue",
          portfolioId: portfolio.id,
          leadUserId: leadId,
        },
      });
      redProjectId = red.id;
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      await tx.project.deleteMany({ where: { id: { in: [redProjectId, createdProjectId].filter(Boolean) } } });
      await tx.portfolio.deleteMany({ where: { id: fixturePortfolioId } });
    });
    await cleanupFixtureUsers(demoBId);
    await cleanupFixtureUsers(riverbankId);
    await prisma.$disconnect();
  });

  it("§10: zero portfolio-less projects in either tenant after the DM1.18 backfill", async () => {
    for (const tenantId of [demoBId, riverbankId]) {
      const orphans = await withTenant({ tenantId, userId: "test" }, (tx) =>
        tx.project.count({ where: { portfolioId: null } }),
      );
      expect(orphans).toBe(0);
    }
  });

  it("§0.5: createProject without a portfolio lands in Unassigned, never null", async () => {
    const project = await createProject(ctx, {
      name: "Sections Default Portfolio Fixture",
      type: "Project",
      priority: "New",
      status: "Planning",
    });
    createdProjectId = project.id;
    const row = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.project.findUniqueOrThrow({
        where: { id: project.id },
        select: { portfolioId: true, portfolio: { select: { name: true } } },
      }),
    );
    expect(row.portfolioId).not.toBeNull();
    expect(row.portfolio?.name).toBe("Unassigned");
  });

  it("§6: sections sort worst health first, Unassigned last and only when non-empty", async () => {
    const data = await getPortfolioSections(ctx);
    expect(data.sections.length).toBeGreaterThan(0);

    for (let i = 1; i < data.sections.length; i++) {
      const prev = data.sections[i - 1];
      const cur = data.sections[i];
      if (cur.isUnassigned) continue; // Unassigned may follow anything…
      expect(prev.isUnassigned).toBe(false); // …but nothing follows Unassigned
      expect(ragRank(prev.rag)).toBeLessThanOrEqual(ragRank(cur.rag));
    }
    // Unassigned renders only while it holds projects (it does right now — the fixture
    // created above sits there), and every returned Unassigned section is non-empty.
    const unassigned = data.sections.filter((s) => s.isUnassigned);
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].projectCount).toBeGreaterThan(0);

    // The Red fixture drags its portfolio to the front of the book.
    const fixture = data.sections.find((s) => s.id === fixturePortfolioId)!;
    expect(fixture.rag).toBe("Red");
    expect(data.sections[0].rag).toBe("Red");
    // viewKind is the section's lens; the interim body is always the pipeline.
    expect(fixture.viewKind).toBe("Rollout");
    expect(fixture.pipeline.groups.flatMap((g) => g.rows).map((r) => r.id)).toContain(redProjectId);
  });

  it("§7: a portfolio move is audited with before/after, and validates the target", async () => {
    await updateProject(ctx, createdProjectId, { portfolioId: fixturePortfolioId });

    const [row, audit] = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      Promise.all([
        tx.project.findUniqueOrThrow({ where: { id: createdProjectId }, select: { portfolioId: true } }),
        tx.auditLog.findFirst({
          where: { entityType: "project", entityId: createdProjectId, actorId: leadId },
          orderBy: { createdAt: "desc" },
        }),
      ]),
    );
    expect(row.portfolioId).toBe(fixturePortfolioId);
    expect((audit?.after as { portfolioId?: string })?.portfolioId).toBe(fixturePortfolioId);
    expect((audit?.before as { portfolioId?: string })?.portfolioId).not.toBe(fixturePortfolioId);

    await expect(
      updateProject(ctx, createdProjectId, { portfolioId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toThrowError(ProjectError);
  });

  it("RLS: tenant B never sees tenant A's portfolios or projects in its sections", async () => {
    const data = await getPortfolioSections(rvCtx);
    expect(data.sections.map((s) => s.id)).not.toContain(fixturePortfolioId);
    const rowIds = data.sections.flatMap((s) => s.pipeline.groups.flatMap((g) => g.rows.map((r) => r.id)));
    expect(rowIds).not.toContain(redProjectId);
    expect(rowIds).not.toContain(createdProjectId);
  });
});

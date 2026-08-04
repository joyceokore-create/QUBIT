// M-P1c (docs/27 §2) — createProjectFromWizard against the real database. The headline
// property is docs/27 §1.6: ONE transaction — members, market org-statuses, template
// link, document and integration land together or not at all.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { decryptSecret } from "@/lib/secret-box";
import { CreateProjectWizardInput, createProjectFromWizard } from "@/server/project-wizard";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("M-P1c project wizard engine", () => {
  let rbId: string;
  let dbId: string;
  let ctx: TenantContext;
  let portfolioId: string;
  let templateId: string;
  let marketId: string;
  let pmId: string;
  let devId: string;
  const madeProjects: string[] = [];

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [pm, dev] = await createUsers(rbId, 2, "pjw");
    pmId = pm.id;
    devId = dev.id;
    ctx = { tenantId: rbId, userId: pmId, roles: ["HeadOfProjects"] };
    portfolioId = (
      await withTenant(ctx, (tx) =>
        tx.portfolio.create({ data: { tenantId: rbId, name: "pjw-fixture-portfolio" }, select: { id: true } }),
      )
    ).id;
    templateId = (
      await withTenant(ctx, (tx) =>
        tx.checkpointTemplate.findFirstOrThrow({ where: { name: "Product build" }, select: { id: true } }),
      )
    ).id;
    marketId = (
      await withTenant(ctx, (tx) =>
        tx.orgUnit.findFirstOrThrow({ where: { kind: "Market" }, select: { id: true } }),
      )
    ).id;
  });

  afterAll(async () => {
    await withTenant(ctx, async (tx) => {
      // ProjectOrgStatus has no delete cascade — clear the market tracks first.
      await tx.projectOrgStatus.deleteMany({ where: { projectId: { in: madeProjects } } });
      await tx.project.deleteMany({ where: { id: { in: madeProjects } } });
      await tx.portfolio.deleteMany({ where: { name: "pjw-fixture-portfolio" } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("creates the whole project in one shot: members, markets, template, doc, integration", async () => {
    process.env.FEATURE_YOUTRACK = "1";
    // Run the WIRE schema over the same input the route would parse — the engine alone
    // skips Zod, which is how a checkpoint-template CUID once failed a .uuid() rule in
    // the browser while this suite stayed green.
    const parsed = CreateProjectWizardInput.safeParse({
      name: "Wizard Flagship",
      portfolioId,
      checkpointTemplateId: templateId, // a CUID, not a UUID
      marketIds: [marketId],
      team: [{ userId: pmId, role: "Project Manager", allocationPct: 20 }],
    });
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);

    const project = await createProjectFromWizard(ctx, {
      name: "Wizard Flagship",
      portfolioId,
      pipelineStage: "Approved" as const, // gap 2: chosen at create, not always Exploring
      programmeId: null,
      checkpointTemplateId: templateId,
      marketIds: [marketId],
      team: [
        { userId: pmId, role: "Project Manager", allocationPct: 20, startDate: null, endDate: null },
        { userId: devId, role: "Developer", allocationPct: 60, startDate: "2026-08-18T00:00:00.000Z", endDate: "2026-11-30T00:00:00.000Z" },
      ],
      document: { title: "BRD — Flagship", kind: "BRD", format: "text", content: "Scope: everything." },
      youtrack: { baseUrl: "https://yt.example.invalid", projectKey: "WFL", token: "tok_synthetic_001" },
      acceptedWarnings: ["Dev would be at 120% (over-allocated)"],
    });
    madeProjects.push(project.id);

    expect(project.code).toMatch(/^WF\d*$/); // initials of the first two words (+suffix if taken)
    expect(project.pipelineStage).toBe("Approved"); // the chosen stage landed (gap 2)
    expect(project.leadUserId).toBe(pmId); // first PM hat becomes the lead

    const [members, org, doc, integ, auditRow] = await withTenant(ctx, async (tx) => [
      await tx.projectMember.findMany({ where: { projectId: project.id }, orderBy: { role: "asc" } }),
      await tx.projectOrgStatus.findMany({ where: { projectId: project.id } }),
      await tx.projectDocument.findFirst({ where: { projectId: project.id } }),
      await tx.projectIntegration.findFirst({ where: { projectId: project.id, provider: "youtrack" } }),
      await tx.auditLog.findFirst({ where: { entityType: "project", entityId: project.id, action: "create" } }),
    ]);
    expect(members).toHaveLength(2);
    const dev = members.find((m) => m.role === "Developer")!;
    expect(dev.allocationPct).toBe(60);
    expect(dev.startDate).not.toBeNull();
    expect(org).toHaveLength(1);
    expect(doc?.kind).toBe("BRD");
    expect(integ?.connected).toBe(true);
    expect(integ?.resource).toBe("WFL");
    // Token stored ENCRYPTED, round-trips, and never appears in the audit blob.
    expect(integ?.secret).not.toContain("tok_synthetic_001");
    expect(decryptSecret(integ!.secret!)).toBe("tok_synthetic_001");
    expect(JSON.stringify(auditRow?.after ?? {})).not.toContain("tok_synthetic_001");
    expect((auditRow?.after as { acceptedWarnings?: string[] })?.acceptedWarnings).toHaveLength(1);
  });

  it("NOTHING lands when a late reference is bad (single transaction)", async () => {
    const before = await withTenant(ctx, (tx) => tx.projectMember.count());
    await expect(
      createProjectFromWizard(ctx, {
        name: "Wizard Doomed",
        portfolioId,
        pipelineStage: "Exploring" as const,
        programmeId: null,
        checkpointTemplateId: null,
        // A market id that is real but NOT kind=Market fails AFTER team validation…
        marketIds: ["00000000-0000-4000-8000-000000000000"],
        team: [{ userId: devId, role: "Developer", allocationPct: 50, startDate: null, endDate: null }],
        acceptedWarnings: [],
      }),
    ).rejects.toMatchObject({ code: "BAD_MARKET" });
    const after = await withTenant(ctx, (tx) => tx.projectMember.count());
    expect(after).toBe(before);
    const ghost = await withTenant(ctx, (tx) => tx.project.findFirst({ where: { name: "Wizard Doomed" } }));
    expect(ghost).toBeNull();
  });

  it("rejects a programme from a different portfolio", async () => {
    const otherPortfolio = await withTenant(ctx, (tx) =>
      tx.portfolio.create({ data: { tenantId: rbId, name: "pjw-fixture-portfolio" }, select: { id: true } }),
    );
    const programme = await withTenant(ctx, (tx) =>
      tx.programme.create({
        data: { tenantId: rbId, portfolioId: otherPortfolio.id, name: "pjw-prog", status: "Active" },
        select: { id: true },
      }),
    );
    await expect(
      createProjectFromWizard(ctx, {
        name: "Wizard Mismatch",
        portfolioId,
        pipelineStage: "Exploring" as const,
        programmeId: programme.id,
        checkpointTemplateId: null,
        marketIds: [],
        team: [],
        acceptedWarnings: [],
      }),
    ).rejects.toMatchObject({ code: "PROGRAMME_MISMATCH" });
    await withTenant(ctx, async (tx) => {
      await tx.programme.delete({ where: { id: programme.id } });
      await tx.portfolio.delete({ where: { id: otherPortfolio.id } });
    });
  });

  it("refuses YouTrack when the flag is off, and a window that ends before it starts", async () => {
    const oldFlag = process.env.FEATURE_YOUTRACK;
    delete process.env.FEATURE_YOUTRACK;
    await expect(
      createProjectFromWizard(ctx, {
        name: "Wizard Flagless",
        portfolioId,
        pipelineStage: "Exploring" as const,
        programmeId: null,
        checkpointTemplateId: null,
        marketIds: [],
        team: [],
        youtrack: { baseUrl: "https://yt.example.invalid", projectKey: "X", token: "t" },
        acceptedWarnings: [],
      }),
    ).rejects.toMatchObject({ code: "YT_DISABLED" });
    process.env.FEATURE_YOUTRACK = oldFlag ?? "1";

    await expect(
      createProjectFromWizard(ctx, {
        name: "Wizard Backwards",
        portfolioId,
        pipelineStage: "Exploring" as const,
        programmeId: null,
        checkpointTemplateId: null,
        marketIds: [],
        team: [{ userId: devId, role: "Developer", allocationPct: 50, startDate: "2026-09-01T00:00:00.000Z", endDate: "2026-08-01T00:00:00.000Z" }],
        acceptedWarnings: [],
      }),
    ).rejects.toMatchObject({ code: "BAD_WINDOW" });
  });

  it("tenant B sees none of it", async () => {
    const dbCtx: TenantContext = { tenantId: dbId, userId: "test", roles: ["Member"] };
    const foreign = await withTenant(dbCtx, (tx) =>
      tx.project.findFirst({ where: { id: { in: madeProjects } } }),
    );
    expect(foreign).toBeNull();
  });
});

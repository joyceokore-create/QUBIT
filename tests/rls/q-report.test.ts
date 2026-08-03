// MVP1 Phase C — Q reporting copilot: grounded reports + AiCallLog + tenant isolation.
// Runs the deterministic (no-API-key) path so it's hermetic and offline.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createProject } from "@/server/projects";
import { setProjectMember } from "@/server/resources";
import { generateReport } from "@/server/q/report";
import { llmModel } from "@/server/q/llm";

describe("MVP1 — Q reporting copilot", () => {
  let demoB: TenantContext;
  let riverbank: TenantContext;
  let kcbName: string;
  let projectId: string;
  let memberName: string;
  const projectIds: string[] = [];

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY; // force the deterministic, offline path
    const [k, r] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!k || !r) throw new Error("Seed required.");
    kcbName = k.name;
    const kUser = await withTenant({ tenantId: k.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    const rUser = await withTenant({ tenantId: r.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    demoB = { tenantId: k.id, userId: kUser.id, roles: [] };
    riverbank = { tenantId: r.id, userId: rUser.id, roles: [] };
    memberName = kUser.name;

    const project = await createProject(demoB, {
      code: `QR-${Date.now().toString().slice(-6)}`,
      name: "Q report test project",
      type: "Project",
      priority: "High",
      status: "AtRisk",
    });
    projectId = project.id;
    projectIds.push(project.id);
    await setProjectMember(demoB, projectId, demoB.userId, { role: "Technical Lead", allocationPct: 60 });
  });

  afterAll(async () => {
    await withTenant({ tenantId: demoB.tenantId, userId: "seed" }, async (tx) => {
      await tx.aiCallLog.deleteMany({ where: { userId: demoB.userId } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    });
    await prisma.$disconnect();
  });

  it("produces a grounded project report from live data (no invention)", async () => {
    const { markdown, usedAi } = await generateReport(demoB, {
      type: "project",
      targetId: projectId,
      tenantName: kcbName,
    });
    expect(usedAi).toBe(false); // deterministic path
    expect(markdown).toContain("Q report test project");
    expect(markdown).toContain(memberName);
    expect(markdown).toContain("60%");
  });

  it("produces a resource/workload report for a person", async () => {
    const { markdown } = await generateReport(demoB, { type: "resource", targetId: demoB.userId, tenantName: kcbName });
    expect(markdown).toContain(memberName);
    expect(markdown.toLowerCase()).toContain("workload");
  });

  it("produces a portfolio summary", async () => {
    const { markdown } = await generateReport(demoB, { type: "portfolio", tenantName: kcbName });
    expect(markdown.toLowerCase()).toContain("portfolio");
  });

  it("writes an AiCallLog row (metrics only) per report", async () => {
    const logs = await withTenant(demoB, (tx) =>
      tx.aiCallLog.findMany({ where: { userId: demoB.userId }, orderBy: { createdAt: "desc" } }),
    );
    expect(logs.length).toBeGreaterThanOrEqual(3);
    expect(logs.map((l) => l.purpose)).toContain("report:project");
    expect(logs.every((l) => l.model === llmModel())).toBe(true);
  });

  it("keeps AiCallLog tenant-isolated (RLS)", async () => {
    const seen = await withTenant(riverbank, (tx) => tx.aiCallLog.findMany({ where: { userId: demoB.userId } }));
    expect(seen).toHaveLength(0); // Riverbank cannot see the fixture tenant's Q call logs
  });

  it("errors cleanly for a missing project", async () => {
    await expect(
      generateReport(demoB, { type: "project", targetId: "does-not-exist", tenantName: kcbName }),
    ).rejects.toThrow(/not found/i);
  });
});

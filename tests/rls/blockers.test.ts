// MVP1 PRD M10 (Blocker Register) + M11 (manager/member reports): CRUD, counts,
// isolation, and grounded reports. Runs the deterministic (no-key) report path.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createProject } from "@/server/projects";
import {
  createBlocker,
  listBlockers,
  updateBlocker,
  getBlockerCounts,
} from "@/server/blockers";
import { generateReport } from "@/server/q/report";

describe("MVP1 — blockers (M10) + manager/member reports (M11)", () => {
  let demoB: TenantContext;
  let riverbank: TenantContext;
  let projectId: string;
  const projectIds: string[] = [];
  // getBlockerCounts is tenant-wide and the seed ships demo blockers (Phase 6.1) —
  // assert deltas against this baseline, not absolute counts.
  let baseline: { open: number; resolved: number; critical: number };

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const [k, r] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!k || !r) throw new Error("Seed required.");
    const kUser = await withTenant({ tenantId: k.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    const rUser = await withTenant({ tenantId: r.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    demoB = { tenantId: k.id, userId: kUser.id, roles: [] };
    riverbank = { tenantId: r.id, userId: rUser.id, roles: [] };
    const project = await createProject(demoB, {
      code: `BL-${Date.now().toString().slice(-6)}`,
      name: "Blocker test project",
      type: "Project",
      priority: "High",
      status: "AtRisk",
    });
    projectId = project.id;
    projectIds.push(project.id);
    baseline = await getBlockerCounts(demoB);
  });

  afterAll(async () => {
    await withTenant({ tenantId: demoB.tenantId, userId: "seed" }, async (tx) => {
      await tx.blocker.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.aiCallLog.deleteMany({ where: { userId: demoB.userId } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    });
    await prisma.$disconnect();
  });

  it("creates blockers and rolls up counts (open/resolved/critical)", async () => {
    await createBlocker(demoB, projectId, { description: "Vendor contract unsigned", severity: "Critical", ownerId: demoB.userId });
    await createBlocker(demoB, projectId, { description: "Test environment down", severity: "Medium" });

    const list = await listBlockers(demoB, { projectId });
    expect(list).toHaveLength(2);

    let counts = await getBlockerCounts(demoB);
    expect(counts).toMatchObject({ open: baseline.open + 2, critical: baseline.critical + 1 });

    const critical = list.find((b) => b.severity === "Critical")!;
    await updateBlocker(demoB, critical.id, { status: "Resolved", resolutionNotes: "Signed 14 Jul" });
    counts = await getBlockerCounts(demoB);
    expect(counts).toMatchObject({ open: baseline.open + 1, resolved: baseline.resolved + 1, critical: baseline.critical });
  });

  it("keeps blockers tenant-isolated (RLS)", async () => {
    const seen = await listBlockers(riverbank, { projectId });
    expect(seen).toHaveLength(0);
  });

  it("manager report is grounded in blockers + risks (deterministic)", async () => {
    const { markdown, usedAi } = await generateReport(demoB, { type: "manager", tenantName: "the fixture tenant" });
    expect(usedAi).toBe(false);
    expect(markdown.toLowerCase()).toContain("manager report");
    expect(markdown).toContain("Test environment down"); // still-open blocker surfaces
  });

  it("member report shows the caller's owned blockers", async () => {
    // The caller owns no open blocker now (the critical one was resolved) — add one they own.
    await createBlocker(demoB, projectId, { description: "Awaiting security sign-off", severity: "Medium", ownerId: demoB.userId });
    const { markdown } = await generateReport(demoB, { type: "member", targetId: demoB.userId, tenantName: "the fixture tenant" });
    expect(markdown.toLowerCase()).toContain("my work");
    expect(markdown).toContain("Awaiting security sign-off");
  });
});

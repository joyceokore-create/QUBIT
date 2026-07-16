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
  let kcb: TenantContext;
  let riverbank: TenantContext;
  let projectId: string;
  const projectIds: string[] = [];

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const [k, r] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!k || !r) throw new Error("Seed required.");
    const kUser = await withTenant({ tenantId: k.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    const rUser = await withTenant({ tenantId: r.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    kcb = { tenantId: k.id, userId: kUser.id, roles: [] };
    riverbank = { tenantId: r.id, userId: rUser.id, roles: [] };
    const project = await createProject(kcb, {
      code: `BL-${Date.now().toString().slice(-6)}`,
      name: "Blocker test project",
      type: "Project",
      priority: "High",
      status: "AtRisk",
    });
    projectId = project.id;
    projectIds.push(project.id);
  });

  afterAll(async () => {
    await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, async (tx) => {
      await tx.blocker.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.aiCallLog.deleteMany({ where: { userId: kcb.userId } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    });
    await prisma.$disconnect();
  });

  it("creates blockers and rolls up counts (open/resolved/critical)", async () => {
    await createBlocker(kcb, projectId, { description: "Vendor contract unsigned", severity: "Critical", ownerId: kcb.userId });
    await createBlocker(kcb, projectId, { description: "Test environment down", severity: "Medium" });

    const list = await listBlockers(kcb, { projectId });
    expect(list).toHaveLength(2);

    let counts = await getBlockerCounts(kcb);
    expect(counts).toMatchObject({ open: 2, critical: 1 });

    const critical = list.find((b) => b.severity === "Critical")!;
    await updateBlocker(kcb, critical.id, { status: "Resolved", resolutionNotes: "Signed 14 Jul" });
    counts = await getBlockerCounts(kcb);
    expect(counts).toMatchObject({ open: 1, resolved: 1, critical: 0 });
  });

  it("keeps blockers tenant-isolated (RLS)", async () => {
    const seen = await listBlockers(riverbank, { projectId });
    expect(seen).toHaveLength(0);
  });

  it("manager report is grounded in blockers + risks (deterministic)", async () => {
    const { markdown, usedAi } = await generateReport(kcb, { type: "manager", tenantName: "KCB" });
    expect(usedAi).toBe(false);
    expect(markdown.toLowerCase()).toContain("manager report");
    expect(markdown).toContain("Test environment down"); // still-open blocker surfaces
  });

  it("member report shows the caller's owned blockers", async () => {
    // The caller owns no open blocker now (the critical one was resolved) — add one they own.
    await createBlocker(kcb, projectId, { description: "Awaiting security sign-off", severity: "Medium", ownerId: kcb.userId });
    const { markdown } = await generateReport(kcb, { type: "member", targetId: kcb.userId, tenantName: "KCB" });
    expect(markdown.toLowerCase()).toContain("my work");
    expect(markdown).toContain("Awaiting security sign-off");
  });
});

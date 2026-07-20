// MVP1 reports centre — period-scoped reports, shareable snapshots, and per-type access.
// Runs the deterministic (no-API-key) path so it's hermetic and offline.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createProject } from "@/server/projects";
import { setProjectMember } from "@/server/resources";
import { generateReport } from "@/server/q/report";
import { createShare, getShareByToken } from "@/server/q/shares";
import { canAccessReport } from "@/server/q/access";

describe("MVP1 — reports centre (period, sharing, access)", () => {
  let kcb: TenantContext;
  let riverbank: TenantContext;
  let kcbName: string;
  let projectId: string;
  const projectIds: string[] = [];
  const shareTokens: string[] = [];

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY; // deterministic, offline path
    const [k, r] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!k || !r) throw new Error("Seed required.");
    kcbName = k.name;
    const kUser = await withTenant({ tenantId: k.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    const rUser = await withTenant({ tenantId: r.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    kcb = { tenantId: k.id, userId: kUser.id, roles: [] };
    riverbank = { tenantId: r.id, userId: rUser.id, roles: [] };

    const project = await createProject(kcb, {
      code: `RC-${Date.now().toString().slice(-6)}`,
      name: "Reports centre project",
      type: "Project",
      priority: "High",
      status: "AtRisk",
    });
    projectId = project.id;
    projectIds.push(project.id);
    await setProjectMember(kcb, projectId, kcb.userId, { role: "Technical Lead", allocationPct: 60 });

    // Activity inside the weekly window: a completed task + a status update (both stamped now).
    await withTenant(kcb, async (tx) => {
      await tx.projectTask.create({
        data: { tenantId: kcb.tenantId, projectId, title: "Ship it", status: "Completed", assigneeId: kcb.userId },
      });
      await tx.projectStatusUpdate.create({
        data: { tenantId: kcb.tenantId, projectId, body: "Kicked off this week", rag: "Amber", postedById: kcb.userId },
      });
    });
  });

  afterAll(async () => {
    await withTenant(kcb, async (tx) => {
      if (shareTokens.length) await tx.sharedReport.deleteMany({ where: { token: { in: shareTokens } } });
      await tx.projectStatusUpdate.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.projectTask.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.aiCallLog.deleteMany({ where: { userId: kcb.userId } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    });
    await prisma.$disconnect();
  });

  it("produces a weekly project report with a period label + activity section", async () => {
    const rep = await generateReport(kcb, { type: "project", targetId: projectId, period: "week", tenantName: kcbName });
    expect(rep.title).toMatch(/weekly report/i);
    expect(rep.periodLabel).toMatch(/week of/i);
    expect(rep.markdown).toMatch(/Activity/i);
    expect(rep.markdown).toMatch(/1 task completed/i); // the completed task in-window
  });

  it("produces a monthly project report titled accordingly", async () => {
    const rep = await generateReport(kcb, { type: "project", targetId: projectId, period: "month", tenantName: kcbName });
    expect(rep.title).toMatch(/monthly report/i);
    expect(rep.periodLabel).toMatch(/month to/i);
  });

  it("shares a report snapshot and reads it back by token", async () => {
    const rep = await generateReport(kcb, { type: "project", targetId: projectId, period: "week", tenantName: kcbName });
    const { token } = await createShare(kcb, {
      type: "project",
      targetId: projectId,
      title: rep.title,
      periodLabel: rep.periodLabel,
      markdown: rep.markdown,
      usedAi: rep.usedAi,
    });
    shareTokens.push(token);
    expect(token.length).toBeGreaterThan(20); // high-entropy, not the row id

    const view = await getShareByToken(kcb, token);
    expect(view).toBeTruthy();
    expect(view?.title).toBe(rep.title);
    expect(view?.markdown).toBe(rep.markdown);
    expect(view?.type).toBe("project");
  });

  it("keeps shared reports tenant-isolated (RLS): another tenant can't resolve the token", async () => {
    const token = shareTokens[0];
    expect(token).toBeTruthy();
    const leaked = await getShareByToken(riverbank, token);
    expect(leaked).toBeNull(); // Riverbank cannot read KCB's shared report
  });

  it("authorises own + read-all reports for everyone, and gates another person's workload", async () => {
    const base = { tenantId: kcb.tenantId, userId: kcb.userId };
    // Own person reports — allowed with no roles.
    expect(await canAccessReport({ ...base, roles: [] }, "member", kcb.userId)).toBe(true);
    expect(await canAccessReport({ ...base, roles: [] }, "resource")).toBe(true); // no target → self
    // Portfolio + project reports are read-all world — allowed for everyone (PROMPT §2).
    expect(await canAccessReport({ ...base, roles: ["Member"] }, "portfolio")).toBe(true);
    expect(await canAccessReport({ ...base, roles: ["Member"] }, "project", projectId)).toBe(true);
    // Another person's workload — denied without report:resource:others or project scope.
    expect(await canAccessReport({ ...base, roles: ["Member"] }, "member", "another-user")).toBe(false);
    // Executive / heads may report on anyone.
    expect(await canAccessReport({ ...base, roles: ["Executive"] }, "resource", "another-user")).toBe(true);
  });
});

// Mock AI mode (Q_MOCK_AI) — Q answers from live tenant data without a key, tenant-scoped,
// including entity-aware lookups ("who's in charge of X", "the team on X").
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createProject, updateProject } from "@/server/projects";
import { setProjectMember } from "@/server/resources";
import { runQChat } from "@/server/q/agent";
import { generatePlan } from "@/server/project-tasks";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

describe("Q mock mode", () => {
  let kcb: TenantContext;
  let leadName: string;
  let memberName: string;
  let code: string;
  const projectIds: string[] = [];

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.Q_MOCK_AI = "1";
    const k = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!k) throw new Error("Seed required.");
    const users = await ensureUsers(k.id, 2);
    kcb = { tenantId: k.id, userId: users[0].id, roles: [] };
    leadName = users[1].name;
    memberName = users[0].name;
    code = `QM${Date.now().toString().slice(-5)}`;
    const project = await createProject(kcb, { code, name: "Mock Chat Project", type: "Project", priority: "High", status: "AtRisk" });
    projectIds.push(project.id);
    await updateProject(kcb, project.id, { leadUserId: users[1].id });
    await setProjectMember(kcb, project.id, users[0].id, { role: "Project Manager" });
  });

  afterAll(async () => {
    await withTenant(kcb, async (tx) => {
      await tx.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.aiCallLog.deleteMany({ where: { userId: kcb.userId } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    });
    delete process.env.Q_MOCK_AI;
    await cleanupFixtureUsers(kcb.tenantId);
    await prisma.$disconnect();
  });

  it("answers 'who is in charge of <project>' from live data", async () => {
    const res = await runQChat(kcb, { messages: [{ role: "user", content: `Who is in charge of project ${code}?` }], tenantName: "KCB" });
    expect(res.usedAi).toBe(false);
    expect(res.reply).toContain(leadName);
    expect(res.toolsUsed).toContain("get_project");
  });

  it("answers 'who's on <project>' with the team", async () => {
    const res = await runQChat(kcb, { messages: [{ role: "user", content: `Who is on ${code}?` }], tenantName: "KCB" });
    expect(res.reply).toContain(memberName);
    expect(res.toolsUsed).toContain("list_members");
  });

  it("resolves the project from an earlier turn (follow-up context)", async () => {
    const res = await runQChat(kcb, {
      messages: [
        { role: "user", content: `Tell me about ${code}` },
        { role: "assistant", content: "…" },
        { role: "user", content: "and who is in charge?" },
      ],
      tenantName: "KCB",
    });
    expect(res.reply).toContain(leadName); // resolved to the project named two turns ago
  });

  it("answers a compound question (status and blockers) in one reply", async () => {
    const res = await runQChat(kcb, { messages: [{ role: "user", content: `Give me the status and blockers for ${code}` }], tenantName: "KCB" });
    expect(res.reply.toLowerCase()).toContain("blocker");
    expect(res.toolsUsed).toContain("list_blockers");
  });

  it("gives an attention briefing across the portfolio", async () => {
    const res = await runQChat(kcb, { messages: [{ role: "user", content: "What needs my attention today?" }], tenantName: "KCB" });
    expect(res.reply.toLowerCase()).toContain("attention");
    expect(res.toolsUsed).toContain("list_projects");
  });

  it("answers a superlative (who has the most work)", async () => {
    const res = await runQChat(kcb, { messages: [{ role: "user", content: "Who has the most work?" }], tenantName: "KCB" });
    expect(res.toolsUsed).toContain("list_workload");
  });

  it("answers a portfolio question when no project is named", async () => {
    const res = await runQChat(kcb, { messages: [{ role: "user", content: "How is the portfolio doing?" }], tenantName: "KCB" });
    expect(res.toolsUsed).toContain("list_projects");
    expect(res.reply.toLowerCase()).toContain("portfolio");
    expect(res.reply.toLowerCase()).toContain("simulated");
  });

  it("generates a plan from pasted text without a key", async () => {
    const plan = await generatePlan(kcb, projectIds[0], {
      text: "Build a mobile onboarding flow.\nSupport OTP login.\nSync balances nightly.",
      tenantName: "KCB",
    });
    const titles = plan.phases.flatMap((p) => p.tasks.map((t) => t.title));
    expect(titles.some((t) => /OTP|onboarding|balances/i.test(t))).toBe(true);
  });
});

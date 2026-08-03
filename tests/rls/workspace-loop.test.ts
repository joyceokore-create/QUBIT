// Workspace phase 2/4 — status-update notifications (PMs + testers) and integrations config.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createProject, updateProject } from "@/server/projects";
import { setProjectMember } from "@/server/resources";
import { postStatusUpdate } from "@/server/status-updates";
import { listNotifications, unreadCount, markRead } from "@/server/notifications";
import { listIntegrations, setIntegration } from "@/server/integrations";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

describe("Workspace — status notifications + integrations", () => {
  let poster: TenantContext;
  let riverbank: TenantContext;
  let leadId: string;
  let qaId: string;
  let projectId: string;
  const projectIds: string[] = [];
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    const [k, r] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!k || !r) throw new Error("Seed required.");
    const kUsers = await ensureUsers(k.id, 3);
    if (kUsers.length < 3) throw new Error("Need 3 the fixture tenant users.");
    const rUser = await withTenant({ tenantId: r.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    poster = { tenantId: k.id, userId: kUsers[0].id, roles: [] };
    riverbank = { tenantId: r.id, userId: rUser.id, roles: [] };
    leadId = kUsers[1].id;
    qaId = kUsers[2].id;
    cleanupUserIds.push(leadId, qaId, poster.userId);

    const project = await createProject(poster, {
      code: `WS-${Date.now().toString().slice(-6)}`,
      name: "Workspace loop test",
      type: "Project",
      priority: "High",
      status: "AtRisk",
    });
    projectId = project.id;
    projectIds.push(project.id);
    await updateProject(poster, projectId, { leadUserId: leadId });
    await setProjectMember(poster, projectId, qaId, { role: "QA Lead" });
    await setProjectMember(poster, projectId, poster.userId, { role: "Developer" });
  });

  afterAll(async () => {
    await withTenant({ tenantId: poster.tenantId, userId: "seed" }, async (tx) => {
      await tx.notification.deleteMany({ where: { userId: { in: cleanupUserIds } } });
      await tx.projectStatusUpdate.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.projectIntegration.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    });
    await cleanupFixtureUsers(poster.tenantId);
    await prisma.$disconnect();
  });

  it("notifies the lead + testers on a status update (not the poster)", async () => {
    const res = await postStatusUpdate(poster, projectId, { body: "Phase 3 dress rehearsal complete.", rag: "Amber" });
    expect(res.notified).toBe(2); // lead + QA Lead, poster excluded

    const qaNotifs = await listNotifications({ ...poster, userId: qaId });
    expect(qaNotifs.some((n) => n.kind === "status_update" && n.link === `/projects/${projectId}`)).toBe(true);
    expect(await unreadCount({ ...poster, userId: qaId })).toBeGreaterThan(0);

    const one = qaNotifs[0];
    await markRead({ ...poster, userId: qaId }, one.id);
    const after = await listNotifications({ ...poster, userId: qaId });
    expect(after.find((n) => n.id === one.id)?.read).toBe(true);
  });

  it("lists all providers and persists connect state", async () => {
    const before = await listIntegrations(poster, projectId);
    expect(before).toHaveLength(6);
    expect(before.every((c) => !c.connected)).toBe(true);

    await setIntegration(poster, projectId, "github", { connected: true, resource: "demoB/qubit" });
    const after = await listIntegrations(poster, projectId);
    const gh = after.find((c) => c.provider === "github")!;
    expect(gh.connected).toBe(true);
    expect(gh.resource).toBe("demoB/qubit");
  });

  it("keeps integrations + notifications tenant-isolated", async () => {
    const rv = await listIntegrations(riverbank, projectId);
    expect(rv.every((c) => !c.connected)).toBe(true); // Riverbank can't see the fixture tenant's github connection
    expect(await listNotifications(riverbank)).toEqual(
      (await listNotifications(riverbank)).filter((n) => n.link !== `/projects/${projectId}`),
    );
  });
});

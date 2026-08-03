// MVP1 Phase A — teams, resource allocation, widened project update, isolation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createTeam, listTeams, getTeam } from "@/server/teams";
import {
  setProjectMember,
  listProjectMembers,
  removeProjectMember,
  setProjectTeams,
  listProjectTeams,
  listUserAllocations,
} from "@/server/resources";
import { createProject, updateProject } from "@/server/projects";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

describe("MVP1 — teams & resource allocation", () => {
  let demoB: TenantContext;
  let riverbank: TenantContext;
  let userA: string;
  let userB: string;
  let projectId: string;
  const teamIds: string[] = [];
  const projectIds: string[] = [];

  beforeAll(async () => {
    const [k, r] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!k || !r) throw new Error("Seed required.");
    const kUsers = await ensureUsers(k.id, 2);
    const rUser = await withTenant({ tenantId: r.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    demoB = { tenantId: k.id, userId: kUsers[0].id, roles: [] };
    riverbank = { tenantId: r.id, userId: rUser.id, roles: [] };
    userA = kUsers[0].id;
    userB = kUsers[1].id;
    const project = await createProject(demoB, {
      code: `QA-${Date.now().toString().slice(-6)}`,
      name: "Resource test project",
      type: "Project",
      priority: "Med",
      status: "Planning",
    });
    projectId = project.id;
    projectIds.push(project.id);
  });

  afterAll(async () => {
    await withTenant({ tenantId: demoB.tenantId, userId: "seed" }, async (tx) => {
      await tx.team.deleteMany({ where: { id: { in: teamIds } } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    });
    await cleanupFixtureUsers(demoB.tenantId);
    await prisma.$disconnect();
  });

  it("creates a team with members and reads it back", async () => {
    const team = await createTeam(demoB, { name: `Delivery ${Date.now()}`, memberIds: [userA, userB], leadUserId: userA });
    teamIds.push(team.id);
    const detail = await getTeam(demoB, team.id);
    expect(detail?.memberCount).toBe(2);
    expect(detail?.leadUserId).toBe(userA);
    expect((await listTeams(demoB)).some((t) => t.id === team.id)).toBe(true);
  });

  it("allocates a person to a project (upsert) and lists their workload", async () => {
    await setProjectMember(demoB, projectId, userA, { role: "Technical Lead", allocationPct: 50 });
    await setProjectMember(demoB, projectId, userA, { role: "Technical Lead", allocationPct: 80 }); // upsert
    await setProjectMember(demoB, projectId, userB, { role: "Business Analyst", allocationPct: 20 });

    const members = await listProjectMembers(demoB, projectId);
    expect(members).toHaveLength(2);
    expect(members.find((m) => m.userId === userA)?.allocationPct).toBe(80);

    const workload = await listUserAllocations(demoB, userA);
    expect(workload.find((w) => w.projectId === projectId)?.role).toBe("Technical Lead");

    await removeProjectMember(demoB, projectId, userB);
    expect(await listProjectMembers(demoB, projectId)).toHaveLength(1);
  });

  it("assigns teams to a project", async () => {
    const team = await createTeam(demoB, { name: `Assigned ${Date.now()}` });
    teamIds.push(team.id);
    await setProjectTeams(demoB, projectId, [team.id]);
    expect((await listProjectTeams(demoB, projectId)).map((t) => t.teamId)).toContain(team.id);
    await setProjectTeams(demoB, projectId, []); // replace with empty
    expect(await listProjectTeams(demoB, projectId)).toHaveLength(0);
  });

  it("updates widened project fields (name + lead)", async () => {
    const updated = await updateProject(demoB, projectId, { name: "Renamed project", leadUserId: userA });
    expect(updated.name).toBe("Renamed project");
    expect(updated.leadUserId).toBe(userA);
  });

  it("keeps teams tenant-isolated (RLS)", async () => {
    const team = await createTeam(demoB, { name: `Secret ${Date.now()}` });
    teamIds.push(team.id);
    expect((await listTeams(riverbank)).some((t) => t.id === team.id)).toBe(false);
    expect(await getTeam(riverbank, team.id)).toBeNull();
  });

  it("enforces unique team name per tenant", async () => {
    const name = `Dupe ${Date.now()}`;
    const t = await createTeam(demoB, { name });
    teamIds.push(t.id);
    await expect(createTeam(demoB, { name })).rejects.toBeTruthy();
  });
});

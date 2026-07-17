// Onboarding tracking — a freshly invited user shows as never-signed-in, no MFA.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createUser, listUsers } from "@/server/users";
import { createTeam } from "@/server/teams";
import { createProject } from "@/server/projects";

describe("Onboarding tracking", () => {
  let kcb: TenantContext;
  const email = `invitee_${Date.now()}@kcb.example.invalid`;

  beforeAll(async () => {
    const k = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!k) throw new Error("Seed required.");
    const admin = await withTenant({ tenantId: k.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    kcb = { tenantId: k.id, userId: admin.id, roles: ["PlatformSuperAdmin"] };
    await createUser(kcb, { name: "Invitee One", email, password: "Passw0rd!23xyz", roles: ["Contributor"] });
  });

  afterAll(async () => {
    await withTenant(kcb, async (tx) => {
      const u = await tx.user.findFirst({ where: { email }, select: { id: true } });
      if (u) {
        await tx.roleAssignment.deleteMany({ where: { userId: u.id } });
        await tx.auditLog.deleteMany({ where: { entityId: u.id } });
        await tx.user.delete({ where: { id: u.id } });
      }
    });
    await prisma.$disconnect();
  });

  it("reports a new user as never-signed-in with no MFA", async () => {
    const user = (await listUsers(kcb)).find((u) => u.email === email);
    expect(user).toBeTruthy();
    expect(user?.lastLoginAt).toBeNull(); // invited, hasn't signed in
    expect(user?.mfaEnabled).toBe(false);
    expect(user?.teamCount).toBe(0);
    expect(user?.projectCount).toBe(0);
  });

  it("invites a user placed on a team + project on day one", async () => {
    const team = await createTeam(kcb, { name: `OB Team ${Date.now()}` });
    const project = await createProject(kcb, { code: `OB-${Date.now().toString().slice(-6)}`, name: "OB", type: "Project", priority: "Medium", status: "Planning" });
    const placedEmail = `placed_${Date.now()}@kcb.example.invalid`;
    await createUser(kcb, {
      name: "Placed User", email: placedEmail, password: "Passw0rd!23xyz", roles: ["Contributor"],
      teamId: team.id, projectId: project.id, projectRole: "Developer",
    });
    const u = (await listUsers(kcb)).find((x) => x.email === placedEmail)!;
    expect(u.teamCount).toBe(1);
    expect(u.projectCount).toBe(1);

    await withTenant(kcb, async (tx) => {
      await tx.teamMember.deleteMany({ where: { userId: u.id } });
      await tx.projectMember.deleteMany({ where: { userId: u.id } });
      await tx.roleAssignment.deleteMany({ where: { userId: u.id } });
      await tx.auditLog.deleteMany({ where: { OR: [{ actorId: u.id }, { entityId: u.id }] } });
      await tx.user.delete({ where: { id: u.id } });
      await tx.team.delete({ where: { id: team.id } });
      await tx.project.delete({ where: { id: project.id } });
    });
  });
});

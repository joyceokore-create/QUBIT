// Role dashboards M1a (docs/17 §1/§9): declared groups persist + audit, derived groups
// merge from live memberships, landing resolution differs per persona, and — the
// governing invariant — groups NEVER alter permissions, in either direction.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { derivedGroups, effectiveGroups, landingPersona } from "@/lib/personas";
import { projectRoleCategory } from "@/lib/roles";
import { createUser, listUsers, setUserGroups } from "@/server/users";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

describe("M1a personas", () => {
  let demoBId: string;
  let adminCtx: TenantContext;
  let inviteeId: string;
  let projectId: string;
  const inviteeEmail = `persona_${Date.now()}@fixture.invalid`;

  beforeAll(async () => {
    const demoB = await prisma.tenant.findUnique({ where: { slug: "demo-b" } });
    if (!demoB) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    demoBId = demoB.id;
    const [admin] = await ensureUsers(demoBId, 1);
    adminCtx = { tenantId: demoBId, userId: admin.id, roles: ["PlatformSuperAdmin"] };

    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      const project = await tx.project.create({
        data: { tenantId: demoBId, code: `PRS${Date.now() % 100000}`, name: "Persona Fixture", type: "Project", priority: "Low", status: "Planning" },
      });
      projectId = project.id;
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      await tx.projectMember.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
      const invitee = await tx.user.findUnique({ where: { tenantId_email: { tenantId: demoBId, email: inviteeEmail } }, select: { id: true } });
      if (invitee) {
        await tx.roleAssignment.deleteMany({ where: { userId: invitee.id } });
        await tx.auditLog.deleteMany({ where: { entityId: invitee.id } });
        await tx.user.delete({ where: { id: invitee.id } });
      }
    });
    await cleanupFixtureUsers(demoBId);
    await prisma.$disconnect();
  });

  it("invite stores declared groups and folds a stray primary in", async () => {
    const { user: user } = await createUser(adminCtx, {
      name: "Persona Invitee",
      email: inviteeEmail,
      roles: ["Member"],
      userGroups: ["qa"],
      primaryGroup: "implementor", // not in the declared set — must be folded in, not lost
    });
    inviteeId = user.id;
    const row = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { userGroups: true, primaryGroup: true } }),
    );
    expect(row.userGroups.sort()).toEqual(["implementor", "qa"]);
    expect(row.primaryGroup).toBe("implementor");
  });

  it("day-one landing: declared groups decide before any membership exists (§1.3)", async () => {
    const row = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.user.findUniqueOrThrow({
        where: { id: inviteeId },
        include: { roles: true, projectAllocations: { select: { role: true } }, projectsLed: { select: { id: true }, take: 1 } },
      }),
    );
    const effective = effectiveGroups(
      row.userGroups,
      derivedGroups({
        membershipCategories: row.projectAllocations.map((m) => projectRoleCategory(m.role)),
        tenantRoles: row.roles.map((r) => r.role),
        leadsProjects: row.projectsLed.length > 0,
      }),
    );
    expect(landingPersona(effective, row.primaryGroup, null)).toBe("implementor");
  });

  it("adding a project membership merges the derived group (§1.3 step 2)", async () => {
    await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.projectMember.create({ data: { tenantId: demoBId, projectId, userId: inviteeId, role: "Developer" } }),
    );
    const summary = (await listUsers(adminCtx)).find((u) => u.id === inviteeId)!;
    expect(summary.derivedGroups).toContain("developer");
    expect(summary.userGroups).not.toContain("developer"); // derived stays visually distinct
  });

  it("group edits persist, audit, and NEVER alter permissions — both directions", async () => {
    const rolesBefore = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.roleAssignment.findMany({ where: { userId: inviteeId }, select: { role: true } }),
    );
    const ctxBefore = { tenantId: demoBId, userId: inviteeId, roles: rolesBefore.map((r) => r.role) };
    const couldManageBefore = can(ctxBefore, "iam:manage");
    const couldReadBefore = can(ctxBefore, "dashboard:read");

    // Direction 1: granting the executive GROUP grants no executive POWER.
    await setUserGroups(adminCtx, inviteeId, { userGroups: ["executive", "qa"], primaryGroup: "executive" });
    // Direction 2: stripping every group removes no access either.
    await setUserGroups(adminCtx, inviteeId, { userGroups: [], primaryGroup: null });

    const rolesAfter = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.roleAssignment.findMany({ where: { userId: inviteeId }, select: { role: true } }),
    );
    expect(rolesAfter).toEqual(rolesBefore); // RBAC rows untouched
    const ctxAfter = { tenantId: demoBId, userId: inviteeId, roles: rolesAfter.map((r) => r.role) };
    expect(can(ctxAfter, "iam:manage")).toBe(couldManageBefore);
    expect(can(ctxAfter, "dashboard:read")).toBe(couldReadBefore);

    const auditRows = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.auditLog.count({ where: { entityId: inviteeId, actorId: adminCtx.userId } }),
    );
    expect(auditRows).toBeGreaterThanOrEqual(2); // both edits audited
  });

  it("two users with different personas resolve to different first screens (§9)", async () => {
    // The invitee (dev membership, no declared groups left) vs a superadmin (executive).
    const summary = (await listUsers(adminCtx)).find((u) => u.id === inviteeId)!;
    const inviteeLanding = landingPersona(effectiveGroups(summary.userGroups, summary.derivedGroups as never), summary.primaryGroup, null);
    const adminLanding = landingPersona(
      effectiveGroups([], derivedGroups({ membershipCategories: [], tenantRoles: ["PlatformSuperAdmin"], leadsProjects: false })),
      null,
      null,
    );
    expect(inviteeLanding).toBe("developer");
    expect(adminLanding).toBe("executive");
    expect(inviteeLanding).not.toBe(adminLanding);
  });
});

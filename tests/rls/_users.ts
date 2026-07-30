import { withTenant } from "@/lib/tenant";

// Test fixtures: since the seed now creates only a super-admin per tenant, tests that need
// several distinct users create synthetic "@fixture.invalid" ones and clean them up.
export interface FixtureUser {
  id: string;
  name: string;
}

/**
 * Always-fresh fixture users. Use this (not ensureUsers) when the test's meaning depends
 * on the people being CLEAN — no tenant roles, no existing project membership, no work
 * assigned. ensureUsers reuses seeded accounts, so its first user is the tenant's
 * super-admin, who holds every permission and already sits on the demo project.
 */
export async function createUsers(tenantId: string, n: number, label = "u"): Promise<FixtureUser[]> {
  return withTenant({ tenantId, userId: "seed" }, async (tx) => {
    const out: FixtureUser[] = [];
    for (let i = 0; i < n; i++) {
      out.push(
        await tx.user.create({
          data: {
            tenantId,
            email: `fixture_${label}_${Date.now()}_${i}@fixture.invalid`,
            name: `Fixture ${label.toUpperCase()}${i + 1}`,
            status: "ACTIVE",
          },
          select: { id: true, name: true },
        }),
      );
    }
    return out;
  });
}

export async function ensureUsers(tenantId: string, n: number): Promise<FixtureUser[]> {
  return withTenant({ tenantId, userId: "seed" }, async (tx) => {
    const existing = await tx.user.findMany({ where: { status: { not: "DELETED" } }, take: n, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
    const out: FixtureUser[] = existing.map((u) => ({ id: u.id, name: u.name }));
    let i = 0;
    while (out.length < n) {
      const created = await tx.user.create({
        data: { tenantId, email: `fixture_${Date.now()}_${i}@fixture.invalid`, name: `Fixture User ${i + 1}`, status: "ACTIVE" },
        select: { id: true, name: true },
      });
      out.push(created);
      i++;
    }
    return out;
  });
}

/** Remove any fixture users created by ensureUsers, nulling references first. */
export async function cleanupFixtureUsers(tenantId: string): Promise<void> {
  await withTenant({ tenantId, userId: "seed" }, async (tx) => {
    const users = await tx.user.findMany({ where: { email: { contains: "@fixture.invalid" } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    if (!ids.length) return;
    await tx.projectTask.updateMany({ where: { assigneeId: { in: ids } }, data: { assigneeId: null } });
    await tx.blocker.updateMany({ where: { ownerId: { in: ids } }, data: { ownerId: null } });
    await tx.notification.deleteMany({ where: { userId: { in: ids } } });
    await tx.projectMember.deleteMany({ where: { userId: { in: ids } } });
    await tx.roleAssignment.deleteMany({ where: { userId: { in: ids } } });
    await tx.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  });
}

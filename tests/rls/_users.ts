import { withTenant } from "@/lib/tenant";

// Test fixtures: since the seed now creates only a super-admin per tenant, tests that need
// several distinct users create synthetic "@fixture.invalid" ones and clean them up.
export interface FixtureUser {
  id: string;
  name: string;
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

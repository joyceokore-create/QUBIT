// UX fidelity Tier 2 — "+ New Issue": createIssue stays in the caller's tenant (another
// tenant's project or owner is refused, never stored) and writes an audit row.
// Requires a migrated, seeded DB. Synthetic data only; cleans up after itself.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createIssue, IssueError } from "@/server/issues";
import { cleanupFixtureUsers, createUsers } from "./_users";

describe("createIssue", () => {
  let rb: TenantContext;
  let bOwnerId: string;
  let bProjectId: string | null = null;
  let bTenantId: string;
  const created: string[] = [];

  beforeAll(async () => {
    const [r, d] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!r || !d) throw new Error("Seed required.");
    bTenantId = d.id;
    const [[actor], [bOwner]] = await Promise.all([createUsers(r.id, 1, "isscreate"), createUsers(d.id, 1, "isscreateb")]);
    rb = { tenantId: r.id, userId: actor.id, roles: ["HeadOfQA"] };
    bOwnerId = bOwner.id;
    const bp = await withTenant({ tenantId: d.id, userId: bOwner.id }, (tx) => tx.project.findFirst({ select: { id: true } }));
    bProjectId = bp?.id ?? null;
  });

  afterAll(async () => {
    await withTenant(rb, async (tx) => {
      await tx.auditLog.deleteMany({ where: { entityId: { in: created } } });
      await tx.issue.deleteMany({ where: { id: { in: created } } });
    });
    await cleanupFixtureUsers(rb.tenantId);
    await cleanupFixtureUsers(bTenantId);
    await prisma.$disconnect();
  });

  it("raises an Open issue in the caller's tenant and audits it", async () => {
    const issue = await createIssue(rb, { title: "zz-fixture duplicate SMS", severity: "Critical", projectId: null, ownerId: null });
    created.push(issue.id);
    expect(issue).toMatchObject({ tenantId: rb.tenantId, status: "Open", severity: "Critical" });
    const audits = await withTenant(rb, (tx) => tx.auditLog.findMany({ where: { entityId: issue.id, action: "create" } }));
    expect(audits).toHaveLength(1);
  });

  it("refuses another tenant's owner or project", async () => {
    await expect(createIssue(rb, { title: "zz-fixture cross owner", severity: "High", ownerId: bOwnerId })).rejects.toBeInstanceOf(IssueError);
    if (bProjectId) await expect(createIssue(rb, { title: "zz-fixture cross project", severity: "High", projectId: bProjectId })).rejects.toBeInstanceOf(IssueError);
    const leaked = await withTenant(rb, (tx) => tx.issue.count({ where: { title: { startsWith: "zz-fixture cross" } } }));
    expect(leaked).toBe(0);
  });
});

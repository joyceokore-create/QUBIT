// Mandatory cross-tenant isolation tests — see docs/04-multitenancy.md and
// docs/12-testing-qa.md. Requires a running Postgres with migrations + rls.sql applied
// and the synthetic seed loaded: `pnpm prisma:migrate && pnpm prisma:seed`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant } from "@/lib/tenant";

describe("RLS tenant isolation", () => {
  let demoBId: string;
  let riverbankId: string;
  let riverbankProjectId: string;

  beforeAll(async () => {
    const [demoB, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!demoB || !riverbank) {
      throw new Error(
        "RLS isolation tests require seeded data — run `pnpm prisma:seed` first.",
      );
    }
    demoBId = demoB.id;
    riverbankId = riverbank.id;

    const rbProject = await withTenant({ tenantId: riverbankId, userId: "test" }, (tx) =>
      tx.project.findFirstOrThrow(),
    );
    riverbankProjectId = rbProject.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns only tenant A's rows when scoped to tenant A", async () => {
    const projects = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.project.findMany(),
    );
    expect(projects.length).toBeGreaterThan(0);
    expect(projects.every((p) => p.tenantId === demoBId)).toBe(true);
  });

  it("cannot read a known tenant-B row while scoped to tenant A", async () => {
    const found = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.project.findUnique({ where: { id: riverbankProjectId } }),
    );
    expect(found).toBeNull();
  });

  it("rejects inserting a row tagged with a different tenant (WITH CHECK)", async () => {
    await expect(
      withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
        tx.project.create({
          data: {
            tenantId: riverbankId, // mismatched tenant — must be rejected
            code: "HACK-001",
            name: "Cross-tenant write attempt",
            type: "Project",
            priority: "Low",
            status: "Planning",
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("denies all rows when no tenant context is set", async () => {
    const rows = await prisma.project.findMany();
    expect(rows).toHaveLength(0);
  });

  it("keeps each tenant's user list disjoint", async () => {
    const [kcbUsers, riverbankUsers] = await Promise.all([
      withTenant({ tenantId: demoBId, userId: "test" }, (tx) => tx.user.findMany()),
      withTenant({ tenantId: riverbankId, userId: "test" }, (tx) => tx.user.findMany()),
    ]);
    const kcbEmails = new Set(kcbUsers.map((u) => u.email));
    expect(riverbankUsers.every((u) => !kcbEmails.has(u.email))).toBe(true);
  });
});

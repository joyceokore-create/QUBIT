// ClickUp foundation: tenant isolation + inheritance (docs/clickup-transformation).
// Requires migrations + rls.sql + seed loaded on the target DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import { forTenant } from "@/server/tenant-db";
import { getHierarchyTree, resolveLocation, resolveStatusGroupId } from "@/server/hierarchy";
import { NotFoundError } from "@/server/errors";

describe("ClickUp hierarchy — isolation & inheritance", () => {
  let kcbId: string;
  let riverbankId: string;

  beforeAll(async () => {
    const [kcb, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !riverbank) {
      throw new Error("Hierarchy tests require seeded data — run `pnpm prisma:seed` first.");
    }
    kcbId = kcb.id;
    riverbankId = riverbank.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns a Space→Folder→List tree scoped to the tenant", async () => {
    const tree = await getHierarchyTree({ tenantId: kcbId, userId: "test" });
    const delivery = tree.find((s) => s.name === "Delivery");
    expect(delivery).toBeDefined();
    // Folderless list present, and the folder holds the Core Banking list with tasks.
    expect(delivery!.lists.some((l) => l.name === "Quick Wins")).toBe(true);
    const core = delivery!.folders.flatMap((f) => f.lists).find((l) => l.name === "Core Banking Rollout");
    expect(core).toBeDefined();
    expect(core!.taskCount).toBeGreaterThan(0);
  });

  it("cannot resolve another tenant's space (cross-tenant → NotFound/404)", async () => {
    const rbSpace = await withTenant({ tenantId: riverbankId, userId: "test" }, (tx) =>
      tx.space.findFirstOrThrow(),
    );
    await expect(
      forTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
        resolveLocation(tx, "SPACE", rbSpace.id),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not leak another tenant's spaces into the tree", async () => {
    const [kcbSpaces, rbSpaces] = await Promise.all([
      withTenant({ tenantId: kcbId, userId: "test" }, (tx) => tx.space.findMany()),
      withTenant({ tenantId: riverbankId, userId: "test" }, (tx) => tx.space.findMany()),
    ]);
    const kcbIds = new Set(kcbSpaces.map((s) => s.id));
    expect(rbSpaces.every((s) => !kcbIds.has(s.id))).toBe(true);
    expect(kcbSpaces.every((s) => s.tenantId === kcbId)).toBe(true);
  });

  it("resolves an inherited status group for a folderless list (List→Space)", async () => {
    await forTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const quickWins = await tx.list.findFirstOrThrow({ where: { name: "Quick Wins" } });
      expect(quickWins.statusGroupId).toBeNull(); // no own group
      const resolved = await resolveStatusGroupId(tx, quickWins.id);
      expect(resolved).not.toBeNull(); // inherited from the space's group
    });
  });

  it("uses a list's own status group when set (no inheritance)", async () => {
    await forTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const core = await tx.list.findFirstOrThrow({ where: { name: "Core Banking Rollout" } });
      expect(core.statusGroupId).not.toBeNull();
      const resolved = await resolveStatusGroupId(tx, core.id);
      expect(resolved).toBe(core.statusGroupId);
    });
  });
});

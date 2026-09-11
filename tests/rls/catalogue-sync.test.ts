// Global catalogue sync (app_module + permission). Requires a migrated DB.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { syncCatalogue } from "@/server/catalogue-sync";
import { APP_MODULES, CATALOGUE_PERMISSIONS } from "@/lib/catalogue";

describe("catalogue sync", () => {
  afterAll(async () => {
    // Leave the catalogue in its true, code-defined state for other suites.
    await syncCatalogue(prisma);
    await prisma.$disconnect();
  });

  it("mirrors every code module and permission (Active)", async () => {
    await syncCatalogue(prisma);
    const [modules, perms] = await Promise.all([
      prisma.appModule.count({ where: { status: "Active" } }),
      prisma.permission.count({ where: { status: "Active" } }),
    ]);
    expect(modules).toBe(APP_MODULES.length);
    expect(perms).toBe(CATALOGUE_PERMISSIONS.length);
  });

  it("is idempotent — a second run deactivates nothing", async () => {
    await syncCatalogue(prisma);
    const result = await syncCatalogue(prisma);
    expect(result.deactivated).toBe(0);
    expect(result.modules).toBe(APP_MODULES.length);
    expect(result.permissions).toBe(CATALOGUE_PERMISSIONS.length);
  });

  it("deactivates a row whose code is no longer in the code catalogue", async () => {
    // A stray permission not present in CATALOGUE_PERMISSIONS, on a real module.
    await prisma.permission.upsert({
      where: { code: "zzz:obsolete" },
      create: { code: "zzz:obsolete", actionName: "Obsolete", moduleCode: "ADMIN_IAM", status: "Active" },
      update: { status: "Active" },
    });
    const result = await syncCatalogue(prisma);
    expect(result.deactivated).toBeGreaterThanOrEqual(1);
    const stray = await prisma.permission.findUnique({ where: { code: "zzz:obsolete" } });
    expect(stray?.status).toBe("Deactivated");
    await prisma.permission.delete({ where: { code: "zzz:obsolete" } });
  });
});

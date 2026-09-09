import type { PrismaClient } from "@prisma/client";
import { APP_MODULES, CATALOGUE_PERMISSIONS } from "@/lib/catalogue";

/**
 * Mirror the code catalogue (src/lib/catalogue.ts) into the global `app_module` and
 * `permission` tables (tuma's SeederService). Idempotent: upsert by code, and any row whose
 * code no longer exists in code is marked Deactivated rather than deleted (keeps history and
 * avoids FK surprises from RolePermission/Permission references). GLOBAL — plain prisma
 * client, no tenant context; these tables are not under RLS.
 *
 * Runs from prisma/seed.ts (dev) and scripts/sync-catalogue.ts (deploy entrypoint).
 */
export async function syncCatalogue(prisma: PrismaClient): Promise<{
  modules: number;
  permissions: number;
  deactivated: number;
}> {
  // Modules first (permissions FK to module code).
  for (const m of APP_MODULES) {
    await prisma.appModule.upsert({
      where: { code: m.code },
      create: {
        code: m.code,
        name: m.name,
        description: m.description,
        allowedRoles: [...m.allowedRoles],
        status: "Active",
      },
      update: {
        name: m.name,
        description: m.description,
        allowedRoles: [...m.allowedRoles],
        status: "Active",
      },
    });
  }

  for (const p of CATALOGUE_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, actionName: p.actionName, moduleCode: p.module, status: "Active" },
      update: { actionName: p.actionName, moduleCode: p.module, status: "Active" },
    });
  }

  // Deactivate rows whose code has been removed from the code catalogue.
  const liveModuleCodes = APP_MODULES.map((m) => m.code);
  const livePermissionCodes = CATALOGUE_PERMISSIONS.map((p) => p.code);
  const [permDeact, modDeact] = await Promise.all([
    prisma.permission.updateMany({
      where: { code: { notIn: livePermissionCodes }, status: "Active" },
      data: { status: "Deactivated" },
    }),
    prisma.appModule.updateMany({
      where: { code: { notIn: liveModuleCodes }, status: "Active" },
      data: { status: "Deactivated" },
    }),
  ]);

  return {
    modules: APP_MODULES.length,
    permissions: CATALOGUE_PERMISSIONS.length,
    deactivated: permDeact.count + modDeact.count,
  };
}

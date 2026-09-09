import { auth } from "@/lib/auth";
import { can, PERMISSION_CATALOGUE } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { listRolePermissions } from "@/server/role-permissions";
import { AdminHeader } from "../admin-header";
import { RolesEditor } from "./roles-editor";
import { ModuleCatalogue } from "./module-catalogue";

export default async function AdminRolesPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };

  const roles = await listRolePermissions(ctx);
  const canManage = can(ctx, "roles:manage");
  const canViewCatalogue = can(ctx, "app_modules:read") || canManage;

  // Global catalogue (app_module + permission) — the DB source of truth, shown as a
  // browsable, module-grouped registry (tuma's App Modules / Permissions views).
  const modules = canViewCatalogue
    ? await prisma.appModule.findMany({
        where: { status: "Active" },
        orderBy: { name: "asc" },
        select: {
          code: true,
          name: true,
          description: true,
          allowedRoles: true,
          permissions: {
            where: { status: "Active" },
            orderBy: { code: "asc" },
            select: { code: true, actionName: true },
          },
        },
      })
    : [];

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader canManageIam={can(ctx, "iam:manage")}
        subtitle={
          canManage
            ? "Edit each role's permissions. Changes apply on the affected user's next sign-in. PlatformSuperAdmin is fixed at full access."
            : "Built-in roles and their permissions. Only a Platform Super Admin can edit them."
        }
      />

      <RolesEditor roles={roles} catalogue={[...PERMISSION_CATALOGUE]} canManage={canManage} />

      {canViewCatalogue && <ModuleCatalogue modules={modules} />}
    </main>
  );
}

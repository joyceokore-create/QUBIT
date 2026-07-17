import { auth } from "@/lib/auth";
import { can, PERMISSION_CATALOGUE } from "@/lib/rbac";
import { listRolePermissions } from "@/server/role-permissions";
import { AdminHeader } from "../admin-header";
import { RolesEditor } from "./roles-editor";

const CARD =
  "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";

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

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader
        subtitle={
          canManage
            ? "Edit each role's permissions. Changes apply on the affected user's next sign-in. PlatformSuperAdmin is fixed at full access."
            : "Built-in roles and their permissions. Only a Platform Super Admin can edit them."
        }
      />

      <RolesEditor roles={roles} catalogue={[...PERMISSION_CATALOGUE]} canManage={canManage} />

      <div className={`${CARD} p-[16px_18px] [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.1s_both]`} style={{ background: "var(--cardbg)" }}>
        <div className="mb-2.5 flex items-baseline gap-2.5">
          <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">Permission catalogue</span>
          <span className="font-mono text-[9.5px] tracking-[1.2px] text-[var(--ink4)]">FR-IAM-04</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERMISSION_CATALOGUE.map((p) => (
            <span key={p} className="rounded-[5px] border border-[var(--hair)] px-2 py-1 font-mono text-[9.5px] tracking-[.3px] text-[var(--ink3)]">
              {p}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}

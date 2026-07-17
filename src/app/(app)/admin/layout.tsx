import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Forbidden } from "@/components/forbidden";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };

  // Console is visible to SuperAdmin + both heads (admin:access). Per-action authority
  // (user CRUD, department edits, team management) is enforced server-side per route below —
  // NOT by hiding tabs (PROMPT §5).
  if (!can(ctx, "admin:access")) {
    return <Forbidden />;
  }

  return <>{children}</>;
}

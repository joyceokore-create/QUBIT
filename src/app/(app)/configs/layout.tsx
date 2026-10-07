import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Forbidden } from "@/components/forbidden";

// Configs — deployment-level configuration (integrations, …). Section is visible to
// SuperAdmin + both heads (admin:access), mirroring Admin; each page re-checks its own
// permission server-side (e.g. Integrations gates project:update).
export default async function ConfigsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!can(ctx, "admin:access")) {
    return <Forbidden />;
  }
  return <>{children}</>;
}

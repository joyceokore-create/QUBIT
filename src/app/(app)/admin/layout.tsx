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
  };

  if (!can(ctx, "iam:manage")) {
    return <Forbidden />;
  }

  return <>{children}</>;
}

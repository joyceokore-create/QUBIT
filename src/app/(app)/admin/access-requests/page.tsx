import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Forbidden } from "@/components/forbidden";
import { AdminHeader } from "../admin-header";
import { listAccessRequests } from "@/server/access-requests";
import { AccessRequestsClient } from "./access-requests-client";

export default async function AdminAccessRequestsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!can(ctx, "iam:manage")) return <Forbidden />;

  const rows = await listAccessRequests();
  const newCount = rows.filter((r) => r.status === "NEW").length;

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader subtitle={`${newCount} new · ${rows.length} total · request-access submissions`} />
      <AccessRequestsClient
        rows={rows.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          email: r.email,
          company: r.company,
          jobTitle: r.jobTitle,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}

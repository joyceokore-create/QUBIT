import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { parseListParams } from "@/lib/list-state";
import { formatDateTime } from "@/lib/dates";
import { Forbidden } from "@/components/forbidden";
import { AdminHeader } from "../admin-header";
import { ACCESS_REQUEST_STATUSES, accessRequestTotals, listAccessRequestsPaged } from "@/server/access-requests";
import { getTenantTimeZone } from "@/server/preferences";
import { AccessRequestsClient } from "./access-requests-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// UX5 (L1–L5): request-access submissions, paged, searched and filtered on the server (L4).
// access_request is a system table (no tenant_id — requests arrive before a tenant exists),
// so the read is gated on iam:manage here rather than scoped by RLS.
export default async function AdminAccessRequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!can(ctx, "iam:manage")) return <Forbidden />;

  const params = parseListParams(await searchParams, { defaultSize: 5, filters: { status: ACCESS_REQUEST_STATUSES } });
  // parseListParams kept `status` only if it is one of ACCESS_REQUEST_STATUSES; the engine's
  // Zod schema checks it again.
  const status = ACCESS_REQUEST_STATUSES.find((s) => s === params.filters.status);
  const [{ rows, info }, totals, tz] = await Promise.all([
    listAccessRequestsPaged({ q: params.q, page: params.page, size: params.size, status }),
    accessRequestTotals(),
    getTenantTimeZone(ctx),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader
        title="Access requests"
        description={`${totals.new} new · ${totals.total} total. People who asked for access from the sign-in page.`}
      />
      <AccessRequestsClient
        info={info}
        anyRequests={totals.total > 0}
        rows={rows.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          email: r.email,
          company: r.company,
          jobTitle: r.jobTitle,
          status: r.status,
          when: formatDateTime(r.createdAt, tz),
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}

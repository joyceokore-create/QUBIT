import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { withTenant } from "@/lib/tenant";
import { parseListParams } from "@/lib/list-state";
import { AR_TAB_SORT, AR_TAB_STATUS, AR_TABS, parseArTab, type AdminRequestRow } from "@/lib/admin-home";
import { Forbidden } from "@/components/forbidden";
import { accessRequestStatusCounts, listAccessRequestsPaged } from "@/server/access-requests";
import { getTenantTimeZone } from "@/server/preferences";
import { AccessRequestsClient } from "./access-requests-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// UX5 (L1–L5) + UX fidelity F1 (design: "Access requests"): status tabs Waiting · Approved ·
// Declined, search, a row list and the shared review drawer. Paged and searched on the
// server (L4). access_request is a system table (no tenant_id — requests arrive before a
// tenant exists), so the read is gated on iam:manage here rather than scoped by RLS.
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

  const params = parseListParams(await searchParams, { defaultSize: 5, filters: { tab: AR_TABS } });
  const tab = parseArTab(params.filters.tab);
  const mayInvite = can(ctx, "users:invite");
  const [{ rows, info }, counts, tz, grantOptions] = await Promise.all([
    listAccessRequestsPaged({ q: params.q, page: params.page, size: params.size, status: AR_TAB_STATUS[tab], sort: AR_TAB_SORT[tab] }),
    accessRequestStatusCounts(),
    getTenantTimeZone(ctx),
    mayInvite
      ? withTenant(ctx, (tx) =>
          Promise.all([
            tx.department.findMany({ select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
            tx.team.findMany({ select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
          ]),
        )
      : Promise.resolve(null),
  ]);

  // The reviewer's name, only if they're in this tenant (looked up under RLS).
  const reviewerIds = [...new Set(rows.map((r) => r.reviewedById).filter((x): x is string => !!x))];
  const reviewers = reviewerIds.length ? await withTenant(ctx, (tx) => tx.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } })) : [];
  const names = new Map(reviewers.map((u) => [u.id, u.name]));

  const list: AdminRequestRow[] = rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    company: r.company,
    jobTitle: r.jobTitle,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewedBy: r.reviewedById ? (names.get(r.reviewedById) ?? null) : null,
  }));

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_22px_90px]">
      <AccessRequestsClient
        tab={tab}
        counts={counts}
        rows={list}
        info={info}
        timeZone={tz}
        nowIso={new Date().toISOString()}
        grant={grantOptions ? { departments: grantOptions[0], teams: grantOptions[1], canGrantSuperAdmin: ctx.roles.includes("PlatformSuperAdmin") } : null}
      />
    </main>
  );
}

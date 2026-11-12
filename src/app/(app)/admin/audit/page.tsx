import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatDateTime } from "@/lib/dates";
import { auditActionOptions } from "@/lib/audit-view";
import { SECONDARY } from "@/lib/surface";
import { resolveAuditFilters } from "@/server/audit-filters";
import { auditFilterOptions, listAuditLogPaged } from "@/server/audit";
import { getTenantTimeZone } from "@/server/preferences";
import { Forbidden } from "@/components/forbidden";
import { AdminHeader } from "../admin-header";
import { AuditClient } from "./audit-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// UX5 (L1–L5): the audit log grows without limit, so it pages, searches and filters on the
// server (L4), under the tenant's RLS context. Dates show in the tenant's time zone, and the
// from/to filter days are read as tenant-local days.
export default async function AdminAuditPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  // Audit is a super-admin surface (§5): heads' scoped console has no audit view.
  if (!can(ctx, "iam:manage")) return <Forbidden />;

  const [options, tz] = await Promise.all([auditFilterOptions(ctx), getTenantTimeZone(ctx)]);
  const sp = await searchParams;
  const { params, period, action, actor, range } = resolveAuditFilters(sp, options, tz);
  const { rows, info } = await listAuditLogPaged(ctx, { q: params.q, page: params.page, size: params.size, action, actor, from: range.gte, to: range.lt });

  // Export uses the same URL filters (minus paging).
  const exportQs = new URLSearchParams();
  for (const k of ["q", "action", "actor", "period", "from", "to"]) {
    const v = sp[k];
    if (typeof v === "string" && v) exportQs.set(k, v);
  }

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_22px_90px]">
      <AdminHeader
        title="Audit Log"
        description="Every change, who made it and when. Times are in your organisation's time zone."
        action={
          <a href={`/api/admin/audit/export${exportQs.size ? `?${exportQs}` : ""}`} className={SECONDARY}>
            Export CSV
          </a>
        }
      />
      <AuditClient
        info={info}
        actionOptions={auditActionOptions(options.actions)}
        actors={options.actors}
        period={period}
        range={{ from: period ? "" : (range.from ?? ""), to: period ? "" : (range.to ?? "") }}
        anyEvents={options.actions.length > 0}
        rows={rows.map((r) => ({
          id: r.id,
          when: formatDateTime(r.createdAt, tz),
          createdAt: r.createdAt.toISOString(),
          actor: r.actorName ?? "System",
          action: r.actionLabel,
          record: r.record,
          change: r.change,
        }))}
      />
    </main>
  );
}

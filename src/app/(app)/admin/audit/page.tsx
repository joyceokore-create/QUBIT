import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { parseListParams } from "@/lib/list-state";
import { formatDateTime } from "@/lib/dates";
import { dayRange } from "@/lib/list-query";
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
  // Allow-lists: Action and Who must be values that exist in THIS tenant's log; from/to are
  // short text here and validated as real calendar days by dayRange.
  const params = parseListParams(await searchParams, {
    defaultSize: 10,
    filters: { action: options.actions, actor: options.actors.map((a) => a.id), from: "text", to: "text" },
  });
  const range = dayRange(params.filters.from, params.filters.to, tz);
  const { rows, info } = await listAuditLogPaged(ctx, {
    q: params.q,
    page: params.page,
    size: params.size,
    action: params.filters.action,
    actor: params.filters.actor,
    from: range.gte,
    to: range.lt,
  });

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader title="Audit log" description="Every change writes a row, at the same moment as the change. Times are in your organisation's time zone." />
      <AuditClient
        info={info}
        actions={options.actions}
        actors={options.actors}
        range={{ from: range.from ?? "", to: range.to ?? "" }}
        anyEvents={options.actions.length > 0}
        rows={rows.map((r) => ({
          id: r.id,
          when: formatDateTime(r.createdAt, tz),
          createdAt: r.createdAt.toISOString(),
          actor: r.actorName ?? r.actorId ?? "—",
          action: r.action,
          entity: `${r.entityType}:${r.entityId}`,
        }))}
      />
    </main>
  );
}

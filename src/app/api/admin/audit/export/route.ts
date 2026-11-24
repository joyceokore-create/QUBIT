import { requirePermission } from "@/lib/api-guard";
import { csvFilename, toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/dates";
import { auditFilterOptions, listAuditLogForExport, type AuditViewRow } from "@/server/audit";
import { resolveAuditFilters } from "@/server/audit-filters";
import { getTenantTimeZone } from "@/server/preferences";

/**
 * GET /api/admin/audit/export — Audit Log › Export CSV (design spec v2). The page's filters
 * (search, Action, Who, period or from/to), newest first, up to AUDIT_EXPORT_LIMIT rows, under
 * the tenant's RLS. Before → after comes from the allow-listed fields only; cells go through
 * the shared CSV writer, which neutralises spreadsheet formulas (= + - @). iam:manage.
 */
export async function GET(req: Request) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const ctx = guard.ctx;
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const [options, tz] = await Promise.all([auditFilterOptions(ctx), getTenantTimeZone(ctx)]);
  const { params, action, actor, range } = resolveAuditFilters(sp, options, tz);
  const rows = await listAuditLogForExport(ctx, { q: params.q, action, actor, from: range.gte, to: range.lt });
  const csv = toCsv<AuditViewRow>(rows, [
    { header: "When", value: (r) => formatDateTime(r.createdAt, tz) },
    { header: "Who", value: (r) => r.actorName ?? "System" },
    { header: "Action", value: (r) => r.actionLabel },
    { header: "Record", value: (r) => r.record },
    { header: "Before → after", value: (r) => r.change },
  ]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename("audit-log")}"`,
      "cache-control": "no-store",
    },
  });
}

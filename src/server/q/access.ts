import { can } from "@/lib/rbac";
import type { TenantContext } from "@/lib/tenant";
import type { QReportType } from "@/server/q/report";

/**
 * Single source of truth for who may generate/share a given report (used by the report
 * route, the share route, and the reports centre UI so they never drift).
 *
 * Rule: a user can always run a report **about themselves** (`member`/`resource` targeting
 * their own id, or no target). Any report about a project, the portfolio, delivery, or
 * *another* person is a management view and requires `reports:read` — held by
 * ProjectManager, PortfolioManager, Executive, Viewer (read-only), and SystemAdmin.
 */
export function canAccessReport(ctx: TenantContext, type: QReportType, targetId?: string): boolean {
  const aboutSelf =
    (type === "member" || type === "resource") && (!targetId || targetId === ctx.userId);
  if (aboutSelf) return true;
  return can(ctx, "reports:read");
}

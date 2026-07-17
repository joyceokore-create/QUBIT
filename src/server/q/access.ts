import { canReportOnPerson } from "@/lib/access";
import type { TenantContext } from "@/lib/tenant";
import type { QReportType } from "@/server/q/report";

/**
 * Single source of truth for who may generate/share a given report (used by the report
 * route, the share route, and the reports centre UI so they never drift). Model (PROMPT §2):
 *
 *  - A person report (member/resource) about YOURSELF → always allowed.
 *  - A person report about ANOTHER person → `report:resource:others` (PlatformSuperAdmin,
 *    Executive, HeadOfProjects, HeadOfQA — any person) OR a ProjectManager for a member of a
 *    project they lead / are PM-member of. Decided by `canReportOnPerson` under RLS.
 *  - Portfolio / delivery(manager) / project reports → read-all world (every authenticated
 *    user), since they summarise globally-readable tenant data.
 *
 * Async because the person-scoping path reads project membership under RLS. Prompts are not
 * a security boundary — this gate is enforced at the tool/route layer (see api/q/report).
 */
export async function canAccessReport(
  ctx: TenantContext,
  type: QReportType,
  targetId?: string,
): Promise<boolean> {
  if (type === "resource" || type === "member") {
    return canReportOnPerson(ctx, targetId);
  }
  // portfolio | manager | project — read-only summaries over globally-readable data.
  return true;
}

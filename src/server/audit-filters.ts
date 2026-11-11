import "server-only";
import { dayKey } from "@/lib/dates";
import { parseListParams } from "@/lib/list-state";
import { dayRange } from "@/lib/list-query";
import { AUDIT_PERIODS } from "@/lib/audit-view";

/**
 * One reading of the Audit Log URL for the page and the CSV export, so both always show the
 * same rows. Action and Who must be values that exist in THIS tenant's log (allow-lists);
 * "role_changes" groups role added/removed; `period` (7d/30d/90d) is a preset that wins over
 * free from/to days, which are validated as real tenant-local calendar days.
 */
export function resolveAuditFilters(
  sp: Record<string, string | string[] | undefined>,
  options: { actions: string[]; actors: { id: string; name: string }[] },
  tz: string,
  now = new Date(),
) {
  const params = parseListParams(sp, {
    defaultSize: 10,
    filters: {
      action: [...options.actions, "role_changes"],
      actor: options.actors.map((a) => a.id),
      period: AUDIT_PERIODS.map((p) => p.value),
      from: "text",
      to: "text",
    },
  });
  const f = params.filters;
  const period = AUDIT_PERIODS.find((p) => p.value === f.period);
  const fromKey = period ? dayKey(new Date(now.getTime() - (period.days - 1) * 86_400_000), tz) : f.from;
  const range = dayRange(fromKey, period ? undefined : f.to, tz);
  return { params, period: period?.value ?? "", action: f.action, actor: f.actor, range };
}

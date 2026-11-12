import { SeverityPill } from "@/components/raid/severity-pill";
import { RaidTh, RAID_ROW, RAID_THEAD } from "@/components/raid/raid-table-parts";
import { IssueStatus } from "@/components/raid/issue-table";
import type { IssuePageRow } from "@/server/issues";
import type { GapReason } from "@/server/raid";

const GAP_REASON_LABEL: Record<GapReason, string> = {
  no_origin_risk: "No prior risk was tracked",
  risk_unowned_or_unmitigated: "Origin risk had no owner or mitigation",
};

/**
 * UX5 — one server-sliced page of the Gap report: issues with no owned, mitigated risk
 * behind them (src/server/raid.ts GAP_ISSUE_WHERE, paged by listIssuesPage({ gap: true })).
 */
export function GapReportTable({ rows }: { rows: IssuePageRow[] }) {
  return (
    <table className="w-full min-w-[820px] text-left text-[13px]">
      <thead className={RAID_THEAD}>
        <tr>
          <RaidTh className="pl-4">Issue</RaidTh>
          <RaidTh>Project</RaidTh>
          <RaidTh>Severity</RaidTh>
          <RaidTh>Status</RaidTh>
          <RaidTh>Origin risk</RaidTh>
          <RaidTh className="pr-4">Gap reason</RaidTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((item) => (
          <tr key={item.id} className={RAID_ROW}>
            <td className="max-w-[320px] py-2.5 pl-4 pr-3 font-semibold text-[var(--qink)]">{item.title}</td>
            <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-[var(--ink3)]">{item.projectCode ?? "—"}</td>
            <td className="whitespace-nowrap px-3 py-2.5">
              <SeverityPill severity={item.severity} />
            </td>
            <td className="whitespace-nowrap px-3 py-2.5">
              <IssueStatus status={item.status} />
            </td>
            <td className="max-w-[240px] px-3 py-2.5 text-[12px] text-[var(--ink3)]">
              <span className="line-clamp-1">{item.originRiskTitle ?? "None"}</span>
            </td>
            <td className="py-2.5 pl-3 pr-4 text-[12px] font-semibold text-[var(--bad-ink)]">{item.gapReason ? GAP_REASON_LABEL[item.gapReason] : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

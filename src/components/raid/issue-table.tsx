"use client";

import { SeverityPill } from "@/components/raid/severity-pill";
import { IssueRowActions } from "@/components/raid/issue-row-actions";
import { RaidTh, RAID_ROW, RAID_THEAD } from "@/components/raid/raid-table-parts";
import type { IssueListItem } from "@/server/issues";
import type { AdminUserSummary } from "@/server/users";
import { cn } from "@/lib/utils";

/**
 * UX5 — one server-sliced page of issues (src/server/issues.ts listIssuesPage). Search,
 * filters and paging live in the URL; this only renders the rows it is given.
 */
interface IssueTableProps {
  issues: IssueListItem[];
  users: AdminUserSummary[];
  canUpdate: boolean;
}

export function IssueStatus({ status }: { status: string }) {
  const done = status === "Closed" || status === "Resolved";
  return (
    <span
      className={cn(
        "inline-block rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.4px]",
        done ? "bg-[var(--surface-2)] text-[var(--ink3)]" : "bg-status-blue-bg text-status-blue",
      )}
    >
      {status}
    </span>
  );
}

export function IssueTable({ issues, users, canUpdate }: IssueTableProps) {
  return (
    <table className="w-full min-w-[880px] text-left text-[13px]">
      <thead className={RAID_THEAD}>
        <tr>
          <RaidTh className="pl-4">Issue</RaidTh>
          <RaidTh>Project</RaidTh>
          <RaidTh>Severity</RaidTh>
          <RaidTh>Owner</RaidTh>
          <RaidTh>Status</RaidTh>
          <RaidTh>Origin</RaidTh>
          {canUpdate && (
            <RaidTh className="w-[56px] pr-4 text-right">
              <span className="sr-only">Actions</span>
            </RaidTh>
          )}
        </tr>
      </thead>
      <tbody>
        {issues.map((issue) => (
          <tr key={issue.id} className={RAID_ROW}>
            <td className="max-w-[340px] py-2.5 pl-4 pr-3 font-semibold text-[var(--qink)]">{issue.title}</td>
            <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-[var(--ink3)]">{issue.projectCode ?? "—"}</td>
            <td className="whitespace-nowrap px-3 py-2.5">
              <SeverityPill severity={issue.severity} />
            </td>
            <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ink2)]">{issue.ownerName ?? "Unowned"}</td>
            <td className="whitespace-nowrap px-3 py-2.5">
              <IssueStatus status={issue.status} />
            </td>
            <td className="max-w-[260px] px-3 py-2.5 text-[12px] text-[var(--ink3)]">
              {issue.originRiskTitle ? (
                <span className="line-clamp-1">
                  <span className="mr-1 rounded-[3px] bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase">From risk</span>
                  {issue.originRiskTitle}
                </span>
              ) : (
                "No prior risk"
              )}
            </td>
            {canUpdate && (
              <td className="py-2.5 pl-3 pr-4 text-right">
                <IssueRowActions issue={issue} users={users} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

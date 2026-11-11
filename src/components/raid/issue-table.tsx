"use client";

import { SeverityPill } from "@/components/raid/severity-pill";
import { raidRef } from "@/lib/raid-ref";
import { IssueRowActions } from "@/components/raid/issue-row-actions";
import { Chip } from "@/components/ui/status-pill";
import { THEAD, TROW } from "@/lib/surface";
import type { IssueListItem } from "@/server/issues";
import type { AdminUserSummary } from "@/server/users";

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
  return <Chip tone={done ? "muted" : status === "Investigating" ? "vio" : "info"}>{status === "Investigating" ? "In progress" : status}</Chip>;
}

/** Short, stable reference shown in the ID column (the first characters of the issue id). */
export const issueRef = raidRef;

function ageOf(createdAt: Date | string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
  return days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`;
}

export function IssueTable({ issues, users, canUpdate }: IssueTableProps) {
  return (
    <table className="w-full min-w-[880px] border-separate border-spacing-0 text-left text-[12.5px]">
      <thead className={THEAD}>
        <tr>
          <th scope="col">ID</th>
          <th scope="col">Issue</th>
          <th scope="col">Project</th>
          <th scope="col">Severity</th>
          <th scope="col">Owner</th>
          <th scope="col">Age</th>
          <th scope="col">Status</th>
          {canUpdate && (
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {issues.map((issue) => (
          <tr key={issue.id} className={TROW}>
            <td className="whitespace-nowrap font-mono text-[11.5px] text-[var(--ds-ink3)]">{issueRef(issue.id)}</td>
            <td className="max-w-[320px]">
              <b className="font-semibold text-[var(--ds-ink)]">{issue.title}</b>
              {issue.originRiskTitle && <span className="block truncate text-[12px] text-[var(--ds-ink3)]">From risk: {issue.originRiskTitle}</span>}
            </td>
            <td className="max-w-[200px] truncate text-[var(--ds-ink2)]">{issue.projectName ?? issue.projectCode ?? "No project"}</td>
            <td className="whitespace-nowrap">
              <SeverityPill severity={issue.severity} />
            </td>
            <td className="whitespace-nowrap text-[var(--ds-ink2)]">{issue.ownerName ?? <Chip tone="warn">Unassigned</Chip>}</td>
            <td className="whitespace-nowrap tabular-nums text-[var(--ds-ink3)]">{ageOf(issue.createdAt)}</td>
            <td className="whitespace-nowrap">
              <IssueStatus status={issue.status} />
            </td>
            {canUpdate && (
              <td className="text-right">
                <IssueRowActions issue={issue} users={users} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

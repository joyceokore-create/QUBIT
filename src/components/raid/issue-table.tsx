"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SeverityPill } from "@/components/raid/severity-pill";
import { IssueRowActions } from "@/components/raid/issue-row-actions";
import { ISSUE_STATUSES, type IssueListItem } from "@/server/issues";
import type { AdminUserSummary } from "@/server/users";

const FILTER_CHIPS: { label: string; value: string | null }[] = [
  { label: "All", value: null },
  ...ISSUE_STATUSES.map((s) => ({ label: s, value: s })),
];

interface IssueTableProps {
  issues: IssueListItem[];
  users: AdminUserSummary[];
  canUpdate: boolean;
}

export function IssueTable({ issues, users, canUpdate }: IssueTableProps) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return issues.filter((i) => {
      if (statusFilter && i.status !== statusFilter) return false;
      if (q && !i.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [issues, statusFilter, query]);

  return (
    <div className="overflow-hidden rounded-[10px] border border-ink-4 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-background p-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_CHIPS.map((chip) => (
            <Button
              key={chip.label}
              type="button"
              size="sm"
              variant={statusFilter === chip.value ? "default" : "outline"}
              onClick={() => setStatusFilter(chip.value)}
            >
              {chip.label}
            </Button>
          ))}
        </div>
        <div className="relative w-full max-w-[240px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
          <Input
            placeholder="Search issues…"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Origin</TableHead>
            {canUpdate && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((issue) => (
            <TableRow key={issue.id}>
              <TableCell className="font-medium">{issue.title}</TableCell>
              <TableCell className="text-ink-2">{issue.projectCode ?? "—"}</TableCell>
              <TableCell>
                <SeverityPill severity={issue.severity} />
              </TableCell>
              <TableCell className="text-ink-2">{issue.ownerName ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={issue.status === "Closed" ? "outline" : "secondary"}>{issue.status}</Badge>
              </TableCell>
              <TableCell className="text-ink-3">
                {issue.originRiskTitle ? (
                  <span className="text-[11px]">
                    <span className="mr-1 rounded-[3px] bg-background px-1.5 py-0.5 text-[9px] font-semibold text-ink-3 uppercase">
                      From risk
                    </span>
                    {issue.originRiskTitle}
                  </span>
                ) : (
                  <span className="text-[11px] text-ink-4">No prior risk</span>
                )}
              </TableCell>
              {canUpdate && (
                <TableCell className="text-right">
                  <IssueRowActions issue={issue} users={users} />
                </TableCell>
              )}
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={canUpdate ? 7 : 6} className="text-center text-ink-3">
                No issues match this filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

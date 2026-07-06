"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HeatPill } from "@/components/raid/heat-pill";
import { RiskStatusPill } from "@/components/raid/risk-status-pill";
import { RiskRowActions } from "@/components/raid/risk-row-actions";
import { RISK_STATUSES, type RiskListItem } from "@/server/risks";
import type { AdminUserSummary } from "@/server/users";

const FILTER_CHIPS: { label: string; value: string | null }[] = [
  { label: "All", value: null },
  ...RISK_STATUSES.map((s) => ({ label: s, value: s })),
];

interface RiskTableProps {
  risks: RiskListItem[];
  users: AdminUserSummary[];
  canUpdate: boolean;
}

export function RiskTable({ risks, users, canUpdate }: RiskTableProps) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return risks.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [risks, statusFilter, query]);

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
            placeholder="Search risks…"
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
            <TableHead>Category</TableHead>
            <TableHead>Heat</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
            {canUpdate && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((risk) => (
            <TableRow key={risk.id}>
              <TableCell className="font-medium">{risk.title}</TableCell>
              <TableCell className="text-ink-2">{risk.projectCode ?? "—"}</TableCell>
              <TableCell className="text-ink-2">{risk.category ?? "—"}</TableCell>
              <TableCell>
                <HeatPill probability={risk.probability} impact={risk.impact} />
              </TableCell>
              <TableCell className="text-ink-2">{risk.ownerName ?? "—"}</TableCell>
              <TableCell>
                <RiskStatusPill status={risk.status} materialised={risk.materialised} />
              </TableCell>
              {canUpdate && (
                <TableCell className="text-right">
                  <RiskRowActions risk={risk} users={users} />
                </TableCell>
              )}
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={canUpdate ? 7 : 6} className="text-center text-ink-3">
                No risks match this filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

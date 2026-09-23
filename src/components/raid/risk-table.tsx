"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeatPill } from "@/components/raid/heat-pill";
import { RiskStatusPill } from "@/components/raid/risk-status-pill";
import { MessageSquare } from "lucide-react";
import { ConversationDrawer } from "@/components/conversation/conversation-drawer";
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
  /** Enables the "Mine" chip (risks the viewer owns) — per Joyce: filter mine everywhere. */
  viewerId?: string;
}

export function RiskTable({ risks, users, canUpdate, viewerId }: RiskTableProps) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [discussRisk, setDiscussRisk] = useState<{ id: string; title: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return risks.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (mineOnly && r.ownerId !== viewerId) return false;
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [risks, statusFilter, mineOnly, viewerId, query]);

  return (
    <div className="overflow-hidden rounded-[10px] border border-ink-4 bg-white">
      <ConversationDrawer
        open={!!discussRisk}
        onOpenChange={(o) => !o && setDiscussRisk(null)}
        title={discussRisk?.title ?? ""}
        entityType="risk"
        entityId={discussRisk?.id ?? null}
        viewerId={viewerId ?? ""}
        canPromote={false}
      />
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
          {viewerId && (
            <Button
              type="button"
              size="sm"
              variant={mineOnly ? "default" : "outline"}
              onClick={() => setMineOnly((m) => !m)}
              title="Risks you own"
            >
              Mine ({risks.filter((r) => r.ownerId === viewerId).length})
            </Button>
          )}
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

      {/* Artifact-style table (the dashboard's .sgt look) — see .sgt-app in globals.css. */}
      <div className="overflow-x-auto px-3 pt-1 pb-3">
        <table className="sgt-app">
          <thead>
            <tr>
              <th>Title</th>
              <th>Project</th>
              <th>Category</th>
              <th>Heat</th>
              <th>Owner</th>
              <th>Status</th>
              {canUpdate && <th className="r">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((risk) => (
              <tr key={risk.id}>
                <td>
                  <span className="name">{risk.title}</span>
                  {risk.mitigation && <span className="desc">{risk.mitigation}</span>}
                </td>
                <td className="text-ink-2">{risk.projectCode ?? "—"}</td>
                <td className="text-ink-2">{risk.category ?? "—"}</td>
                <td>
                  <HeatPill probability={risk.probability} impact={risk.impact} />
                </td>
                <td className="text-ink-2">{risk.ownerName ?? "—"}</td>
                <td>
                  <RiskStatusPill status={risk.status} materialised={risk.materialised} />
                </td>
                {canUpdate && (
                  <td className="r">
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setDiscussRisk({ id: risk.id, title: risk.title })}
                        title="Discuss this risk"
                        aria-label="Discuss this risk"
                        className="rounded p-1 text-ink-3 transition-colors hover:text-brand"
                      >
                        <MessageSquare className="size-3.5" />
                      </button>
                      <RiskRowActions risk={risk} users={users} />
                    </span>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canUpdate ? 7 : 6} className="text-center text-ink-3">
                  No risks match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

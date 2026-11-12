"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { HeatPill } from "@/components/raid/heat-pill";
import { RiskStatusPill } from "@/components/raid/risk-status-pill";
import { ConversationDrawer } from "@/components/conversation/conversation-drawer";
import { RiskRowActions } from "@/components/raid/risk-row-actions";
import { FOCUS } from "@/lib/surface";
import type { RiskListItem } from "@/server/risks";
import type { AdminUserSummary } from "@/server/users";
import { RaidTh, RAID_ROW, RAID_THEAD } from "@/components/raid/raid-table-parts";

/**
 * UX5 — one server-sliced page of risks. Search, filters and paging live in the URL and run
 * on the server (src/server/risks.ts listRisksPage); this only renders the rows it is given.
 */
interface RiskTableProps {
  risks: RiskListItem[];
  users: AdminUserSummary[];
  canUpdate: boolean;
  viewerId: string;
}

export function RiskTable({ risks, users, canUpdate, viewerId }: RiskTableProps) {
  const [discussRisk, setDiscussRisk] = useState<{ id: string; title: string } | null>(null);

  return (
    <>
      <ConversationDrawer
        open={!!discussRisk}
        onOpenChange={(o) => !o && setDiscussRisk(null)}
        title={discussRisk?.title ?? ""}
        entityType="risk"
        entityId={discussRisk?.id ?? null}
        viewerId={viewerId}
        canPromote={false}
      />
      <table className="w-full min-w-[880px] text-left text-[13px]">
        <thead className={RAID_THEAD}>
          <tr>
            <RaidTh className="pl-4">Risk</RaidTh>
            <RaidTh>Project</RaidTh>
            <RaidTh>Category</RaidTh>
            <RaidTh>Severity</RaidTh>
            <RaidTh>Owner</RaidTh>
            <RaidTh>Status</RaidTh>
            {canUpdate && (
              <RaidTh className="w-[88px] pr-4 text-right">
                <span className="sr-only">Actions</span>
              </RaidTh>
            )}
          </tr>
        </thead>
        <tbody>
          {risks.map((risk) => (
            <tr key={risk.id} className={RAID_ROW}>
              <td className="max-w-[360px] py-2.5 pl-4 pr-3">
                <span className="block font-semibold text-[var(--qink)]">{risk.title}</span>
                {risk.mitigation && <span className="line-clamp-1 text-[12px] text-[var(--ink3)]">{risk.mitigation}</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-[var(--ink3)]">{risk.projectCode ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ink2)]">{risk.category ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <HeatPill probability={risk.probability} impact={risk.impact} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ink2)]">{risk.ownerName ?? "Unowned"}</td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <RiskStatusPill status={risk.status} materialised={risk.materialised} />
              </td>
              {canUpdate && (
                <td className="py-2.5 pl-3 pr-4 text-right">
                  <span className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDiscussRisk({ id: risk.id, title: risk.title })}
                      title="Discuss this risk"
                      aria-label={`Discuss risk: ${risk.title}`}
                      className={`rounded p-1 text-[var(--ink3)] transition-colors hover:text-[var(--brand)] ${FOCUS}`}
                    >
                      <MessageSquare className="size-3.5" />
                    </button>
                    <RiskRowActions risk={risk} users={users} />
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

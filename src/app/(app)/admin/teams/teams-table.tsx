"use client";

import { AdminTable, type AdminColumn } from "@/components/admin/admin-table";
import { TeamRowActions } from "./team-row-actions";
import type { TeamSummary } from "@/server/teams";
import type { AdminUserSummary } from "@/server/users";

/**
 * The teams directory, rendered through the shared AdminTable (docs/21 M-O2b) so it
 * matches the users screen instead of carrying its own CARD/ROW constants. Client
 * component because the row actions are interactive; the page stays a server component.
 */
export function TeamsTable({ teams, users }: { teams: TeamSummary[]; users: AdminUserSummary[] }) {
  const columns: AdminColumn<TeamSummary>[] = [
    {
      key: "name",
      header: "Name",
      width: "minmax(0,1.3fr)",
      render: (t) => <span className="truncate text-[13px] rv:text-body-sm font-semibold text-[var(--qink)]">{t.name}</span>,
    },
    {
      key: "description",
      header: "Description",
      width: "minmax(0,1.7fr)",
      render: (t) => <span className="truncate text-[12px] rv:text-body-sm text-[var(--ink3)]">{t.description ?? "—"}</span>,
    },
    {
      key: "lead",
      header: "Lead",
      width: "150px",
      render: (t) => <span className="truncate text-[12px] rv:text-body-sm text-[var(--ink3)]">{t.leadUserName ?? "—"}</span>,
    },
    {
      key: "members",
      header: "Members",
      width: "90px",
      render: (t) => <span className="text-[12px] rv:text-body-sm text-[var(--ink3)]">{t.memberCount}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      width: "110px",
      align: "end",
      render: (t) => <TeamRowActions team={t} users={users} />,
    },
  ];

  return (
    <AdminTable
      title="Teams"
      countLabel="team"
      columns={columns}
      rows={teams}
      getRowKey={(t) => t.id}
      empty="No teams yet."
    />
  );
}

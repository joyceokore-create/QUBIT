"use client";

import { AdminTable, type AdminColumn } from "@/components/admin/admin-table";
import { TeamRowActions } from "./team-row-actions";
import type { TeamSummary } from "@/server/teams";
import type { AdminUserSummary } from "@/server/users";

/**
 * The teams directory, rendered through the shared AdminTable (a spec table: THEAD/TROW,
 * like Users and Departments). Client
 * component because the row actions are interactive; the page stays a server component.
 */
export function TeamsTable({ teams, users }: { teams: TeamSummary[]; users: AdminUserSummary[] }) {
  const columns: AdminColumn<TeamSummary>[] = [
    {
      key: "name",
      header: "Name",
      width: "minmax(0,1.3fr)",
      render: (t) => <span className="text-[13px] font-semibold text-[var(--ds-ink)]">{t.name}</span>,
    },
    {
      key: "description",
      header: "Description",
      width: "minmax(0,1.7fr)",
      render: (t) => <span className="line-clamp-2 text-[var(--ds-ink3)]">{t.description ?? "—"}</span>,
    },
    {
      key: "lead",
      header: "Lead",
      width: "180px",
      render: (t) => <span className="whitespace-nowrap">{t.leadUserName ?? "—"}</span>,
    },
    {
      key: "members",
      header: "Members",
      width: "100px",
      render: (t) => <span className="tabular-nums">{t.memberCount}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      width: "64px",
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

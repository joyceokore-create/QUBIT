import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listTeams } from "@/server/teams";
import { listUsers } from "@/server/users";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Forbidden } from "@/components/forbidden";
import { TeamFormDialog } from "./team-form-dialog";
import { TeamRowActions } from "./team-row-actions";

export default async function AdminTeamsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "iam:manage")) return <Forbidden />;

  const [teams, users] = await Promise.all([listTeams(ctx), listUsers(ctx)]);

  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <Breadcrumb items={[{ label: "Group Overview", href: "/dashboard" }, { label: "Teams" }]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[21px] font-bold tracking-[-0.5px] text-foreground">Teams</h1>
          <p className="mt-[3px] text-xs text-ink-3">
            {teams.length} cross-functional {teams.length === 1 ? "team" : "teams"}
          </p>
        </div>
        <TeamFormDialog
          users={users}
          trigger={
            <Button>
              <Plus /> New team
            </Button>
          }
        />
      </div>

      <div className="overflow-hidden rounded-[10px] border border-ink-4 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Members</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-ink-2">{t.description ?? "—"}</TableCell>
                <TableCell className="text-ink-2">{t.leadUserName ?? "—"}</TableCell>
                <TableCell className="text-ink-2">{t.memberCount}</TableCell>
                <TableCell className="text-right">
                  <TeamRowActions team={t} users={users} />
                </TableCell>
              </TableRow>
            ))}
            {teams.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-ink-3">
                  No teams yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

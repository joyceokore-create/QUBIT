import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listTeams } from "@/server/teams";
import { listUsers } from "@/server/users";
import { Button } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { AdminHeader } from "../admin-header";
import { TeamFormDialog } from "./team-form-dialog";
import { TeamsTable } from "./teams-table";

// Teams now uses the same shell as every other admin screen (docs/21 M-O2b): AdminHeader
// + the standard max-w-[1360px] main wrapper + AdminTable — no Breadcrumb, no local
// CARD/ROW constants. Gate unchanged: iam:manage.
export default async function AdminTeamsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "iam:manage")) return <Forbidden />;

  const [teams, users] = await Promise.all([listTeams(ctx), listUsers(ctx)]);

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader
        subtitle={`${teams.length} cross-functional ${teams.length === 1 ? "team" : "teams"}`}
        action={
          <TeamFormDialog
            users={users}
            trigger={
              <Button className="rounded-full">
                <Plus /> New team
              </Button>
            }
          />
        }
      />
      <TeamsTable teams={teams} users={users} />
    </main>
  );
}

import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listTeams } from "@/server/teams";
import { listUsers } from "@/server/users";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Forbidden } from "@/components/forbidden";
import { TeamFormDialog } from "./team-form-dialog";
import { TeamRowActions } from "./team-row-actions";

// Same bespoke table treatment as the other admin surfaces (audit, access-requests):
// elevated card + grid rows with an uppercase overline header and divider rows.
const CARD =
  "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";
const ROW =
  "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)_150px_90px_110px] items-center gap-3.5 p-[10px_18px]";

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
          <h1 className="font-heading text-[21px] rv:text-heading-sm font-bold tracking-[-0.5px] text-foreground">Teams</h1>
          <p className="mt-[3px] text-xs rv:text-body-sm text-ink-3">
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

      <div className={`overflow-hidden ${CARD}`} style={{ background: "var(--cardbg)" }}>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className={`${ROW} border-b border-[var(--hair)] font-mono rv:font-sans text-[9px] rv:text-overline font-semibold uppercase tracking-[1.6px] text-[var(--ink4)]`}>
              <span>Name</span>
              <span>Description</span>
              <span>Lead</span>
              <span>Members</span>
              <span className="justify-self-end">Actions</span>
            </div>
            {teams.map((t) => (
              <div key={t.id} className={`${ROW} border-b border-[var(--hair2)] transition-colors last:border-0 hover:bg-[var(--wash)]`}>
                <span className="truncate text-[13px] rv:text-body-sm font-semibold text-[var(--qink)]">{t.name}</span>
                <span className="truncate text-[12px] rv:text-body-sm text-[var(--ink3)]">{t.description ?? "—"}</span>
                <span className="truncate text-[12px] rv:text-body-sm text-[var(--ink3)]">{t.leadUserName ?? "—"}</span>
                <span className="text-[12px] rv:text-body-sm text-[var(--ink3)]">{t.memberCount}</span>
                <span className="justify-self-end">
                  <TeamRowActions team={t} users={users} />
                </span>
              </div>
            ))}
            {teams.length === 0 && (
              <div className="p-8 text-center text-[12px] rv:text-body-sm text-[var(--ink5)]">No teams yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

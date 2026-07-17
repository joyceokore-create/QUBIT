import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listUsers } from "@/server/users";
import { listDepartments } from "@/server/departments";
import { listTeams } from "@/server/teams";
import { listProjects } from "@/server/projects";
import { Forbidden } from "@/components/forbidden";
import { AdminHeader } from "../admin-header";
import { NewUserDialog } from "./new-user-dialog";
import { UsersClient, type AdminInsight } from "./users-client";

// Grounded "Q" admin insights — computed from live directory data (no LLM needed for
// this page; the insights are deterministic facts about who needs attention).
function buildInsights(
  users: {
    name: string;
    status: string;
    departmentName: string | null;
    roles: string[];
    createdAt: Date;
    lastLoginAt: Date | null;
    mfaEnabled: boolean;
  }[],
): AdminInsight[] {
  const out: AdminInsight[] = [];
  const active = users.filter((u) => u.status === "ACTIVE");
  const pending = active.filter((u) => u.lastLoginAt === null);
  const noMfaAdmins = users.filter((u) => u.status !== "DELETED" && u.roles.includes("PlatformSuperAdmin") && !u.mfaEnabled);
  const suspended = users.filter((u) => u.status === "SUSPENDED");
  const noDept = users.filter((u) => u.status !== "DELETED" && !u.departmentName);
  const admins = users.filter((u) => u.roles.includes("PlatformSuperAdmin") && u.status === "ACTIVE");

  if (pending.length)
    out.push({
      color: "amber",
      text: `${pending.length} invited ${pending.length === 1 ? "user hasn’t" : "users haven’t"} signed in yet — resend their temporary credentials.`,
    });
  if (noMfaAdmins.length)
    out.push({
      color: "red",
      text: `${noMfaAdmins.length} admin ${noMfaAdmins.length === 1 ? "account has" : "accounts have"} no MFA — enforce TOTP for privileged roles.`,
    });
  if (suspended.length)
    out.push({
      color: "amber",
      text: `${suspended.length} suspended ${suspended.length === 1 ? "account" : "accounts"} — review whether access is still needed.`,
    });
  if (noDept.length)
    out.push({
      color: "amber",
      text: `${noDept.length} ${noDept.length === 1 ? "user has" : "users have"} no org unit — assign one so reporting lines stay complete.`,
    });
  if (admins.length <= 1)
    out.push({ color: "amber", text: `Only ${admins.length} active system admin — add a second to avoid a single point of failure.` });
  if (out.length === 0)
    out.push({ color: "green", text: "Everyone has signed in, with MFA, an org unit and a role — nothing needs attention." });
  return out;
}

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles };
  if (!can(ctx, "iam:manage")) return <Forbidden />;

  const [users, departments, teams, projects] = await Promise.all([
    listUsers(ctx),
    listDepartments(ctx),
    listTeams(ctx),
    listProjects(ctx, {}),
  ]);
  const insights = buildInsights(users);

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader
        subtitle={`${users.length} ${users.length === 1 ? "user" : "users"} · directory, roles & access for ${session.user.tenantName}`}
        action={
          <NewUserDialog
            departments={departments.map((d) => ({ id: d.id, name: d.name }))}
            teams={teams.map((t) => ({ id: t.id, name: t.name }))}
            projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
          />
        }
      />
      <UsersClient users={users} departments={departments} currentUserId={session.user.id} insights={insights} />
    </main>
  );
}

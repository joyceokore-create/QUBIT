import { auth } from "@/lib/auth";
import { can, CANONICAL_ROLES, primaryRoleLabel } from "@/lib/rbac";
import { ssoEnabled } from "@/lib/sso";
import { parseListParams } from "@/lib/list-state";
import { listUserOptions, listUsersPaged, userDirectoryStats, USER_LIST_STATUSES, USER_ONBOARDING_FILTERS, type UserDirectoryStats } from "@/server/users";
import { listAssignableRoles } from "@/server/role-permissions";
import { listDepartments } from "@/server/departments";
import { listTeams } from "@/server/teams";
import { listProjects } from "@/server/projects";
import { getTenantTimeZone } from "@/server/preferences";
import { Forbidden } from "@/components/forbidden";
import { AdminHeader } from "../admin-header";
import { NewUserDialog } from "./new-user-dialog";
import { UsersClient, type AdminInsight } from "./users-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Grounded "Q" admin insights — deterministic facts about who needs attention, from
// whole-directory counts (UX5: the page no longer loads every user to work them out).
function buildInsights(s: UserDirectoryStats, sso: boolean): AdminInsight[] {
  const out: AdminInsight[] = [];
  if (s.notSignedIn)
    out.push({
      color: "amber",
      // Under SSO there are no invites or temporary credentials — sign-in is via Microsoft.
      text: sso
        ? `${s.notSignedIn} ${s.notSignedIn === 1 ? "user hasn’t" : "users haven’t"} signed in with Microsoft yet.`
        : `${s.notSignedIn} invited ${s.notSignedIn === 1 ? "user hasn’t" : "users haven’t"} signed in yet — resend their temporary credentials.`,
    });
  // App-level TOTP only applies without SSO; with SSO, MFA is enforced at the identity
  // provider (Entra), which the app can't see — so this insight would always misfire.
  if (!sso && s.noMfaAdmins)
    out.push({
      color: "red",
      text: `${s.noMfaAdmins} admin ${s.noMfaAdmins === 1 ? "account has" : "accounts have"} no MFA — enforce TOTP for privileged roles.`,
    });
  if (s.suspended)
    out.push({
      color: "amber",
      text: `${s.suspended} suspended ${s.suspended === 1 ? "account" : "accounts"} — review whether access is still needed.`,
    });
  if (s.noDepartment)
    out.push({
      color: "amber",
      text: `${s.noDepartment} ${s.noDepartment === 1 ? "user has" : "users have"} no org unit — assign one so reporting lines stay complete.`,
    });
  if (s.activeAdmins <= 1)
    out.push({ color: "amber", text: `Only ${s.activeAdmins} active system admin — add a second to avoid a single point of failure.` });
  if (out.length === 0)
    out.push({
      color: "green",
      text: sso
        ? "Everyone has signed in, with an org unit and a role — nothing needs attention."
        : "Everyone has signed in, with MFA, an org unit and a role — nothing needs attention.",
    });
  return out;
}

// UX5 (L1–L5): the directory grows without limit, so it pages, searches and filters on the
// server (L4) under the tenant's RLS context; the URL carries q / page / size / filters and
// is allow-listed here before it reaches Prisma.
export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "admin:access")) return <Forbidden />;
  const canManageUsers = can(ctx, "users:roles"); // full CRUD — PlatformSuperAdmin only
  const canInvite = can(ctx, "users:invite"); // PlatformSuperAdmin + heads
  const canGrantSuperAdmin = ctx.roles.includes("PlatformSuperAdmin"); // mirrors the server guard (M-O1)
  const canResetPassword = can(ctx, "users:reset"); // M-O3 — stricter than users:invite
  const sso = ssoEnabled();

  const [departments, teams, projects, assignableRoles, stats, managerOptions, tz] = await Promise.all([
    listDepartments(ctx),
    listTeams(ctx),
    listProjects(ctx, {}),
    listAssignableRoles(ctx),
    userDirectoryStats(ctx, { sso }),
    listUserOptions(ctx),
    getTenantTimeZone(ctx),
  ]);
  // Custom roles only — the dialog already knows the built-ins.
  const customRoles = assignableRoles.filter((r) => !(CANONICAL_ROLES as readonly string[]).includes(r));

  // Allow-lists for every filter: the tenant's assignable roles, its departments (+ "none"),
  // MFA on/off (not offered under SSO — MFA lives at the identity provider), the listable
  // statuses and the onboarding gaps the overview tiles filter on.
  const params = parseListParams(await searchParams, {
    defaultSize: 10,
    filters: {
      role: assignableRoles,
      department: [...departments.map((d) => d.id), "none"],
      mfa: sso ? [] : (["on", "off"] as const),
      status: USER_LIST_STATUSES,
      onboarding: USER_ONBOARDING_FILTERS,
    },
  });
  const f = params.filters;
  const { rows, info } = await listUsersPaged(ctx, {
    q: params.q,
    page: params.page,
    size: params.size,
    role: f.role,
    department: f.department,
    mfa: f.mfa === "on" || f.mfa === "off" ? f.mfa : undefined,
    status: USER_LIST_STATUSES.find((s) => s === f.status),
    onboarding: USER_ONBOARDING_FILTERS.find((o) => o === f.onboarding),
  });

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader
        canManageIam={can(ctx, "iam:manage")}
        title="Users"
        description={`${stats.all} ${stats.all === 1 ? "user" : "users"} · directory, roles & access for ${session.user.tenantName}`}
        action={
          canInvite ? (
            <NewUserDialog
              departments={departments.map((d) => ({ id: d.id, name: d.name }))}
              teams={teams.map((t) => ({ id: t.id, name: t.name }))}
              projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
              canGrantSuperAdmin={canGrantSuperAdmin}
              sso={sso}
            />
          ) : undefined
        }
      />
      <UsersClient
        users={rows}
        info={info}
        stats={stats}
        timeZone={tz}
        departments={departments}
        managerOptions={managerOptions}
        roleOptions={assignableRoles.map((r) => ({ value: r, label: primaryRoleLabel([r]) }))}
        currentUserId={session.user.id}
        insights={buildInsights(stats, sso)}
        canManage={canManageUsers}
        canGrantSuperAdmin={canGrantSuperAdmin}
        canResetPassword={canResetPassword}
        customRoles={customRoles}
        sso={sso}
      />
    </main>
  );
}

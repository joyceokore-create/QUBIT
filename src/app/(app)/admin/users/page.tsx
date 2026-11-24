import { auth } from "@/lib/auth";
import { can, CANONICAL_ROLES, primaryRoleLabel } from "@/lib/rbac";
import { ssoEnabled } from "@/lib/sso";
import { parseListParams } from "@/lib/list-state";
import { listUserOptions, listUsersPaged, userDirectoryStats, USER_LIST_STATUSES, USER_LIST_TABS, USER_ONBOARDING_FILTERS, type UserListTab } from "@/server/users";
import { listAssignableRoles } from "@/server/role-permissions";
import { listDepartments } from "@/server/departments";
import { listTeams } from "@/server/teams";
import { listProjects } from "@/server/projects";
import { getTenantTimeZone } from "@/server/preferences";
import { Forbidden } from "@/components/forbidden";
import { TabStrip } from "@/components/ui/tab-strip";
import { AdminHeader } from "../admin-header";
import { NewUserDialog } from "./new-user-dialog";
import { UsersClient } from "./users-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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
  const sp = await searchParams;
  // UX11 — tabs: All users · No MFA (`?tab=nomfa`, a stable link the Admin home uses). The No
  // MFA tab is the NO_MFA_WHERE base set (ACTIVE, no TOTP); it doesn't exist under SSO, where
  // MFA lives at the identity provider — a stale ?tab=nomfa then reads as All users.
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: UserListTab = (USER_LIST_TABS as readonly string[]).includes(rawTab ?? "") && !(sso && rawTab === "nomfa") ? (rawTab as UserListTab) : "all";

  const params = parseListParams(sp, {
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
  // On the No MFA tab the tab itself fixes status (ACTIVE) and MFA (off), so those two
  // filters are neither offered nor applied there; search, role, department, onboarding and
  // paging still apply on top of the tab's base set.
  const nomfa = tab === "nomfa";
  const { rows, info } = await listUsersPaged(ctx, {
    q: params.q,
    page: params.page,
    size: params.size,
    role: f.role,
    department: f.department,
    mfa: !nomfa && (f.mfa === "on" || f.mfa === "off") ? f.mfa : undefined,
    status: tab !== "all" ? undefined : USER_LIST_STATUSES.find((s) => s === f.status),
    onboarding: USER_ONBOARDING_FILTERS.find((o) => o === f.onboarding),
    tab,
  });

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader
        canManageIam={can(ctx, "iam:manage")}
        title="Users"
        description={`${stats.all} ${stats.all === 1 ? "person" : "people"} in ${session.user.tenantName}`}
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
        key={tab}
        tab={tab}
        // Hidden under SSO, like the MFA tile and filter. Each tab is a plain link, so
        // switching tab drops the other tab's search, filters and page.
        tabs={
          <TabStrip
            label="User views"
            active={tab}
            tabs={[
              { key: "all", label: "All", href: "/admin/users", count: stats.all },
              { key: "active", label: "Active", href: "/admin/users?tab=active", count: stats.active },
              { key: "invited", label: "Invited", href: "/admin/users?tab=invited", count: stats.invited },
              ...(sso ? [] : [{ key: "nomfa", label: "No MFA", href: "/admin/users?tab=nomfa", count: stats.noMfa }]),
              { key: "suspended", label: "Suspended", href: "/admin/users?tab=suspended", count: stats.suspended },
            ]}
          />
        }
        users={rows}
        info={info}
        stats={stats}
        timeZone={tz}
        departments={departments}
        managerOptions={managerOptions}
        roleOptions={assignableRoles.map((r) => ({ value: r, label: primaryRoleLabel([r]) }))}
        currentUserId={session.user.id}
        canInviteImport={canInvite}
        canManage={canManageUsers}
        canGrantSuperAdmin={canGrantSuperAdmin}
        canResetPassword={canResetPassword}
        customRoles={customRoles}
        sso={sso}
      />
    </main>
  );
}

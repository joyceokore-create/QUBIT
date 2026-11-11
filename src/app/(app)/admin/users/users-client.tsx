"use client";

import { useState, type ReactNode } from "react";
import { dayKey, formatDayMonth } from "@/lib/dates";
import type { AdminUserSummary, UserDirectoryStats, UserListTab } from "@/server/users";
import type { DepartmentSummary } from "@/server/departments";
import type { PageInfo } from "@/lib/list-state";
import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter, type FilterOption } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { UserEditDrawer } from "./user-edit-drawer";
import { Chip } from "@/components/ui/status-pill";
import { COMPACT, SECONDARY, THEAD, TROW } from "@/lib/surface";
import { PeopleImportPanel } from "@/components/admin/people-import-panel";


// UX5 (L1–L5): the server pages, searches and filters the directory (see page.tsx); this
// component renders the overview tiles, the toolbar, the current page and the always-visible
// footer, with every bit of view state in the URL. The tiles are shortcuts that SET the same
// URL filters (status / mfa / onboarding), so a tile and the toolbar can never disagree.
//
// UX11: the All users · No MFA tabs (`?tab=nomfa`) sit above the toolbar. The No MFA tab is a
// base set (ACTIVE, no TOTP — the same rule as the No MFA tile) that already fixes status and
// MFA, so those two filters step aside there. The tiles stay whole-directory shortcuts: a tile
// click returns to All users with its filters set.

const FILTER_KEYS = ["role", "department", "mfa", "status", "onboarding"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
/** Filters the No MFA tab leaves in play (it fixes status and MFA itself). */
const NOMFA_FILTER_KEYS = ["role", "department", "onboarding"] as const satisfies readonly FilterKey[];
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", INVITED: "Invited", SUSPENDED: "Suspended" };
const MFA_LABEL: Record<string, string> = { on: "MFA set", off: "MFA not set" };
const ONBOARDING_LABEL: Record<string, string> = { "not-signed-in": "Never signed in", unplaced: "Not on a team or project" };

export function UsersClient({
  tab = "all",
  tabs,
  users,
  info,
  stats,
  timeZone,
  departments,
  managerOptions,
  roleOptions,
  currentUserId,
  canManage,
  canGrantSuperAdmin = false,
  canResetPassword = false,
  customRoles = [],
  sso = false,
  canInviteImport = false,
}: {
  /** The active base set (UX11). */
  tab?: UserListTab;
  /** The All users · No MFA tab strip, rendered above the toolbar (absent under SSO). */
  tabs?: ReactNode;
  /** The current page of the directory (server-paged). */
  users: AdminUserSummary[];
  info: PageInfo;
  /** Whole-directory counts for the overview tiles. */
  stats: UserDirectoryStats;
  /** Tenant time zone for "Last active". */
  timeZone: string;
  departments: DepartmentSummary[];
  /** Every non-deleted user (id + name) — the manager picker in Edit department. */
  managerOptions: { id: string; name: string }[];
  /** The tenant's assignable roles (canonical + active custom) — the Role filter. */
  roleOptions: FilterOption[];
  currentUserId: string;
  /** Full user CRUD (roles/suspend/delete) — PlatformSuperAdmin only. Heads see a read-only
   * directory (the row-action menu collapses to department membership). */
  canManage: boolean;
  /** Only a Super Admin may grant the Super Admin role (mirrors the server guard, M-O1). */
  canGrantSuperAdmin?: boolean;
  /** users:reset — admin-initiated password reset links (M-O3). */
  canResetPassword?: boolean;
  /** ACTIVE custom role names — offered in the edit-roles dialog. */
  customRoles?: string[];
  /** SSO configured — MFA is enforced at the identity provider, not app-level TOTP, so the
   *  onboarding widget and the MFA filter drop the app-level MFA signal. */
  sso?: boolean;
  /** users:invite — offers "Import People" (bulk invite) in the toolbar. */
  canInviteImport?: boolean;
}) {
  const list = useListUrl("admin-users", 10);
  const [editId, setEditId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const nomfaTab = tab === "nomfa";
  // The tab fixes status (Active / Invited / Suspended / No MFA); only "All" offers it as a filter.
  const filterKeys: readonly FilterKey[] = nomfaTab ? NOMFA_FILTER_KEYS : tab === "all" ? FILTER_KEYS : FILTER_KEYS.filter((k) => k !== "status");
  // A key the tab doesn't use reads as unset, so it shows no chip (the server ignores it too).
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, filterKeys.includes(k) ? list.get(k) : ""])) as Record<FilterKey, string>;

  const departmentOptions: FilterOption[] = [...departments.map((d) => ({ value: d.id, label: d.name })), { value: "none", label: "No department" }];
  const statusOptions: FilterOption[] = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));
  const mfaOptions: FilterOption[] = Object.entries(MFA_LABEL).map(([value, label]) => ({ value, label }));

  const labelOf = (opts: FilterOption[], v: string) => opts.find((o) => o.value === v)?.label;
  // Chips only for values the server accepted (an unknown value in the URL is ignored there).
  const chip = (key: FilterKey, name: string, label: string | undefined): ActiveFilter[] => (f[key] && label ? [{ key, label: `${name}: ${label}` }] : []);
  const active: ActiveFilter[] = [
    ...chip("role", "Role", labelOf(roleOptions, f.role)),
    ...chip("department", "Department", labelOf(departmentOptions, f.department)),
    // "MFA set" / "MFA not set" already name the filter.
    ...(!sso && f.mfa && MFA_LABEL[f.mfa] ? [{ key: "mfa", label: MFA_LABEL[f.mfa] }] : []),
    ...chip("status", "Status", STATUS_LABEL[f.status]),
    ...chip("onboarding", "Onboarding", ONBOARDING_LABEL[f.onboarding]),
  ];
  const filtered = (nomfaTab || stats.all > 0) && (active.length > 0 || !!list.q);
  const clearFilters = () => list.clear([...filterKeys]);

  const roleLabel = (r: string) => roleOptions.find((o) => o.value === r)?.label ?? r;
  const editing = editId ? (users.find((u) => u.id === editId) ?? null) : null;

  return (
    <div className="flex flex-col gap-4">
      {tabs}
      <ListToolbar>
        <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search users by name, email or department" label="Search users" />
        <FilterSelect label="Role" allLabel="All roles" value={f.role} options={roleOptions} onChange={(v) => list.set({ role: v })} />
        <FilterSelect label="Department" allLabel="All departments" value={f.department} options={departmentOptions} onChange={(v) => list.set({ department: v })} />
        {!sso && !nomfaTab && <FilterSelect label="MFA" allLabel="MFA: any" value={f.mfa} options={mfaOptions} onChange={(v) => list.set({ mfa: v })} />}
        {tab === "all" && <FilterSelect label="Status" allLabel="All statuses" value={f.status} options={statusOptions} onChange={(v) => list.set({ status: v })} />}
        <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={clearFilters} />
        {canInviteImport && (
          <button type="button" aria-expanded={showImport} onClick={() => setShowImport((o) => !o)} className={`${SECONDARY} ml-auto`}>
            Import People
          </button>
        )}
      </ListToolbar>
      {showImport && <PeopleImportPanel />}

      <TableCard footer={<TableFooter info={info} noun="users" onPage={list.setPage} onSize={list.setSize} />}>
        {users.length === 0 && nomfaTab && !filtered ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="text-[14px] font-semibold text-[var(--ds-ink)]">Everyone has MFA set up.</p>
            <p className="max-w-[48ch] text-[12.5px] text-[var(--ds-ink3)]">Active users who haven’t turned on two-factor sign-in appear here.</p>
          </div>
        ) : users.length === 0 ? (
          <ListEmpty filtered={filtered} noun="users" onClear={clearFilters} hint={filtered ? undefined : "Use “Invite User” to add the first person."} />
        ) : (
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-[12.5px]">
            <thead className={THEAD}>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Role</th>
                <th scope="col">Department</th>
                {!sso && <th scope="col">MFA</th>}
                <th scope="col">Last Active</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={TROW}>
                  <td>
                    <b className="block max-w-[260px] truncate font-semibold text-[var(--ds-ink)]">{u.name}</b>
                    <span className="block max-w-[260px] truncate text-[12px] text-[var(--ds-ink3)]">{u.email}</span>
                  </td>
                  <td className="text-[var(--ds-ink2)]">{u.roles.map(roleLabel).join(", ") || "None"}</td>
                  <td className="text-[var(--ds-ink2)]">
                    <span className="block max-w-[180px] truncate">{u.departmentName ?? "None"}</span>
                  </td>
                  {!sso && (
                    <td>
                      {u.status === "SUSPENDED" ? (
                        <Chip>Suspended</Chip>
                      ) : u.status === "INVITED" ? (
                        <Chip tone="info">Invite sent</Chip>
                      ) : u.mfaEnabled ? (
                        <Chip tone="ok">On</Chip>
                      ) : (
                        <Chip tone="bad">Off</Chip>
                      )}
                    </td>
                  )}
                  <td className="whitespace-nowrap tabular-nums text-[var(--ds-ink3)]">{u.lastLoginAt ? lastActive(u.lastLoginAt, timeZone) : "Never"}</td>
                  <td className="text-right">
                    {u.status !== "DELETED" && (
                      <button type="button" onClick={() => setEditId(u.id)} className={COMPACT}>
                        {u.status === "INVITED" ? "Resend" : "Edit"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      <UserEditDrawer
        user={editing}
        onClose={() => setEditId(null)}
        currentUserId={currentUserId}
        timeZone={timeZone}
        departments={departments}
        managerOptions={managerOptions}
        roleLabel={roleLabel}
        canManage={canManage}
        canGrantSuperAdmin={canGrantSuperAdmin}
        canResetPassword={canResetPassword}
        customRoles={customRoles}
        sso={sso}
      />
    </div>
  );
}

/** "Today", "Yesterday", "3 days ago", then the date. */
function lastActive(d: Date | string, tz: string): string {
  const days = Math.round((Date.parse(`${dayKey(new Date(), tz)}T00:00:00Z`) - Date.parse(`${dayKey(d, tz)}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDayMonth(d, tz);
}


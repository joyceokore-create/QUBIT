"use client";

import type { ReactNode } from "react";
import { formatDayMonth } from "@/lib/dates";
import type { AdminUserSummary, UserDirectoryStats, UserListTab } from "@/server/users";
import type { DepartmentSummary } from "@/server/departments";
import type { PageInfo } from "@/lib/list-state";
import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter, type FilterOption } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { UserRowActions } from "./user-row-actions";
import { CARD_GLASS as CARD, FOCUS } from "@/lib/surface";
import { PeopleImportPanel } from "@/components/admin/people-import-panel";

export interface AdminInsight {
  text: string;
  color: "amber" | "blue" | "green" | "red";
}
const DOT: Record<AdminInsight["color"], string> = { amber: "--warn", blue: "--qinfo", green: "--ok", red: "--bad" };

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

// Onboarding is "complete" when a user has signed in and been placed on a team or project —
// plus, WITHOUT SSO, enrolled app-level TOTP. With SSO, MFA is enforced at the identity
// provider (which the app can't observe), so the MFA signal is dropped. Each remaining step
// is a dot in the directory + a filter in the overview strip.
function steps(u: AdminUserSummary) {
  return {
    signedIn: u.lastLoginAt !== null,
    mfa: u.mfaEnabled,
    placed: u.teamCount + u.projectCount > 0,
  };
}

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

/** A tile = an exact combination of the status / mfa / onboarding filters. */
type Segment = "all" | "invited" | "nomfa" | "unassigned" | "suspended";
const SEGMENT_FILTERS: Record<Segment, Record<"status" | "mfa" | "onboarding", string | null>> = {
  all: { status: null, mfa: null, onboarding: null },
  invited: { status: "ACTIVE", mfa: null, onboarding: "not-signed-in" },
  nomfa: { status: "ACTIVE", mfa: "off", onboarding: null },
  unassigned: { status: "ACTIVE", mfa: null, onboarding: "unplaced" },
  suspended: { status: "SUSPENDED", mfa: null, onboarding: null },
};

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
  insights,
  canManage,
  canGrantSuperAdmin = false,
  canResetPassword = false,
  customRoles = [],
  sso = false,
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
  insights: AdminInsight[];
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
}) {
  const list = useListUrl("admin-users", 10);
  const nomfaTab = tab === "nomfa";
  const filterKeys: readonly FilterKey[] = nomfaTab ? NOMFA_FILTER_KEYS : FILTER_KEYS;
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

  // A tile reflects the whole directory, so it only lights up on the All users tab.
  const segment = nomfaTab ? undefined : (Object.keys(SEGMENT_FILTERS) as Segment[]).find((k) => {
    const want = SEGMENT_FILTERS[k];
    return (want.status ?? "") === f.status && (want.mfa ?? "") === f.mfa && (want.onboarding ?? "") === f.onboarding;
  });

  const tiles: { key: Segment; label: string; value: number; token: string }[] = [
    { key: "all", label: "All users", value: stats.all, token: "--qink" },
    { key: "invited", label: "Never signed in", value: stats.notSignedIn, token: "--warn" },
    // App-level MFA doesn't apply under SSO (enforced at the identity provider), so hide it.
    ...(sso ? [] : [{ key: "nomfa" as const, label: "No MFA", value: stats.noMfa, token: "--bad" }]),
    { key: "unassigned", label: "Unassigned", value: stats.unplaced, token: "--qinfo" },
    { key: "suspended", label: "Suspended", value: stats.suspended, token: "--ink4" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* DM1.72 — bulk invite, relocated here when the org-setup wizard retired. */}
      <PeopleImportPanel />
      {/* Onboarding overview — each tile sets the matching directory filters */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.06s_both]">
        <div className={`${CARD} p-[14px_16px]`} style={{ background: "radial-gradient(300px 120px at 50% -40%, color-mix(in oklab, var(--ok) 16%, transparent), transparent 65%), var(--cardbg)" }}>
          <div className="font-heading rv:font-data text-[24px] rv:text-data-lg font-bold tabular-nums text-[var(--ok)]">{stats.onboarded}</div>
          <div className="font-mono rv:font-sans text-[9px] rv:text-overline uppercase tracking-[1.2px] text-[var(--ink4)]">Fully onboarded</div>
        </div>
        {tiles.map((t) => {
          const on = segment === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              onClick={() => list.set({ ...SEGMENT_FILTERS[t.key], tab: null })}
              className={`${CARD} p-[14px_16px] text-left transition-colors ${FOCUS}`}
              style={{ borderColor: on ? "var(--brand)" : "var(--cardbd)", background: on ? "color-mix(in oklab, var(--brand) 8%, transparent)" : "var(--cardbg)" }}
            >
              <div className="font-heading rv:font-data text-[24px] rv:text-data-lg font-bold tabular-nums" style={{ color: `var(${t.token})` }}>{t.value}</div>
              <div className="font-mono rv:font-sans text-[9px] rv:text-overline uppercase tracking-[1.2px] text-[var(--ink4)]">{t.label}</div>
            </button>
          );
        })}
      </div>

      {/* Toolbar outside the table card, above the directory and its rail (L2) */}
      <div className="flex flex-col gap-2">
        {tabs}
        <ListToolbar>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search names or emails" label="Search users" />
          <FilterSelect label="Role" allLabel="All roles" value={f.role} options={roleOptions} onChange={(v) => list.set({ role: v })} />
          <FilterSelect label="Department" allLabel="All departments" value={f.department} options={departmentOptions} onChange={(v) => list.set({ department: v })} />
          {!sso && !nomfaTab && <FilterSelect label="MFA" allLabel="MFA: any" value={f.mfa} options={mfaOptions} onChange={(v) => list.set({ mfa: v })} />}
          {!nomfaTab && <FilterSelect label="Status" allLabel="All statuses" value={f.status} options={statusOptions} onChange={(v) => list.set({ status: v })} />}
        </ListToolbar>
        <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={clearFilters} />
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_300px] [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.12s_both]">
        {/* Directory: the card holds only the table, its empty state and the footer (L2) */}
        <div className="min-w-0">
          <TableCard footer={<TableFooter info={info} noun="users" onPage={list.setPage} onSize={list.setSize} />}>
            {users.length === 0 && nomfaTab && !filtered ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <p className="text-[14px] font-semibold text-[var(--qink)]">Everyone has MFA set up.</p>
                <p className="max-w-[48ch] text-[12.5px] text-[var(--ink3)]">Active users who haven’t turned on two-factor sign-in appear here.</p>
              </div>
            ) : users.length === 0 ? (
              <ListEmpty filtered={filtered} noun="users" onClear={clearFilters} hint={filtered ? undefined : "Use “Create a user” to add the first person."} />
            ) : (
              <table className="relative w-full min-w-[780px] text-left text-[13px]">
                <thead className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--ink3)]">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-semibold">User</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Roles</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Department</th>
                    <th scope="col" className="w-[120px] whitespace-nowrap px-3 py-2.5 font-semibold" title={sso ? "Signed in · placed on a team or project" : "Signed in · MFA · placed on a team or project"}>
                      Onboarding
                    </th>
                    <th scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">Last active</th>
                    <th scope="col" className="w-10 px-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const s = steps(u);
                    // SSO drops the MFA step from the checklist (enforced at the IdP).
                    const stepFlags = sso ? [s.signedIn, s.placed] : [s.signedIn, s.mfa, s.placed];
                    const okCount = stepFlags.filter(Boolean).length;
                    return (
                      <tr key={u.id} className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-2)]">
                        <td className="px-4 py-2.5">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className="flex size-[30px] flex-none items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "color-mix(in oklab, var(--brand) 14%, transparent)", color: "var(--brand)" }}>
                              {initials(u.name)}
                            </span>
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                <span className="block max-w-[260px] truncate font-semibold text-[var(--qink)]">{u.name}</span>
                                {u.status === "SUSPENDED" && <span className="rounded px-1 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[.5px]" style={{ color: "var(--bad)", background: "color-mix(in oklab, var(--bad) 14%, transparent)" }}>Susp</span>}
                                {u.status === "INVITED" && <span className="rounded px-1 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[.5px]" style={{ color: "var(--qinfo)", background: "color-mix(in oklab, var(--qinfo) 14%, transparent)" }}>Invited</span>}
                              </span>
                              <span className="block max-w-[260px] truncate text-[12px] text-[var(--ink3)]">{u.email}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="flex flex-wrap gap-1">
                            {u.roles.slice(0, 3).map((r) => (
                              <span key={r} className="rounded-[5px] bg-[var(--wash2)] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[.3px] text-[var(--ink3)]">{r}</span>
                            ))}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--ink2)]">
                          <span className="block max-w-[180px] truncate">{u.departmentName ?? <span className="text-[var(--ink3)]">—</span>}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-1.5">
                            <Dot on={s.signedIn} label="Signed in" />
                            {!sso && <Dot on={s.mfa} label="MFA enabled" />}
                            <Dot on={s.placed} label="Placed on a team/project" />
                            <span className="ml-1 font-mono rv:font-data text-[9px] rv:text-data-sm text-[var(--ink5)]">{okCount}/{sso ? 2 : 3}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[12px] tabular-nums text-[var(--ink3)]">
                          {u.lastLoginAt ? formatDayMonth(u.lastLoginAt, timeZone) : <span className="font-semibold text-[var(--warn)]">Never</span>}
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="flex justify-end">
                            <UserRowActions user={u} currentUserId={currentUserId} departments={departments} users={managerOptions} canManage={canManage} canGrantSuperAdmin={canGrantSuperAdmin} canResetPassword={canResetPassword} customRoles={customRoles} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </TableCard>
        </div>

        {/* Rail — Q admin insights */}
        <aside className="flex flex-col gap-3.5">
          <div className={`overflow-hidden ${CARD}`} style={{ background: "radial-gradient(380px 180px at 50% -60%, color-mix(in oklab, var(--brand) 16%, transparent), transparent 65%), var(--cardbg)" }}>
            <div className="border-b border-[var(--hair)] p-[13px_16px] font-heading text-[13px] rv:text-heading-xs font-bold text-[var(--qink)]">Insights</div>
            <div className="flex flex-col">
              {insights.map((i, idx) => (
                <div key={idx} className="flex gap-2.5 border-b border-[var(--hair2)] p-[11px_16px] last:border-0">
                  <span className="mt-[5px] size-[7px] flex-none rounded-full" style={{ background: `var(${DOT[i.color]})` }} />
                  <span className="text-[12px] rv:text-body-sm leading-[1.5] text-[var(--ink2)]">{i.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[14px] border border-dashed border-[var(--hair)] p-[14px_16px] text-[11.5px] rv:text-body-xs leading-[1.55] text-[var(--ink4)]">
            {sso
              ? "A user is ready once they’ve signed in with Microsoft and joined a team or project. MFA is enforced by your identity provider. Use the tiles above to find who’s stuck, and “Create a user” to add someone."
              : "A user is ready once they’ve signed in, enabled MFA, and joined a team or project. Use the tiles above to find who’s stuck, and “Create a user” to add someone."}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Dot({ on, label }: { on: boolean; label: string }) {
  return <span className="size-2 rounded-[2px]" style={{ background: on ? "var(--ok)" : "var(--w14)" }} title={`${label}: ${on ? "done" : "pending"}`} />;
}

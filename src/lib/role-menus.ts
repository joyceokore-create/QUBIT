import type { ViewRole } from "@/lib/view-roles";

/**
 * The sidebar menu per role (UX plan D6, from the approved artifact). Roles pick the
 * layout; permissions hide items (D2): an item is shown only when the viewer holds its
 * permission, so no link ever leads to a Forbidden page, and a group left empty is
 * dropped. Pages that don't exist yet (Decisions) join in their own phases.
 * Pure and client-safe; `icon` names map to lucide icons in the shell.
 */
export type MenuIcon =
  | "home" | "board" | "inbox" | "layers" | "folder" | "bulb" | "alert" | "users" | "chart"
  | "shield" | "filter" | "user" | "key" | "building" | "compass" | "history";

/**
 * What the page itself checks: ONE permission (`perm`), or — for a page that opens to
 * holders of any of several (UX8 Approvals: idea:triage OR staffing:manage) — `anyPerm`.
 */
export type MenuGate = { perm: string; anyPerm?: never } | { perm?: never; anyPerm: readonly string[] };

export type MenuItem = MenuGate & {
  key: string;
  label: string;
  href: string;
  icon: MenuIcon;
  /** App-module code (src/lib/catalogue.ts) for module allowedRoles gating. */
  module?: string;
};
export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const I = {
  home: { key: "home", label: "Home", href: "/dashboard", icon: "home", perm: "dashboard:read", module: "DASHBOARD" },
  // UX8 (D5): ideas and staffing requests waiting for a decision; the page opens to either.
  approvals: { key: "approvals", label: "Approvals", href: "/approvals", icon: "inbox", anyPerm: ["idea:triage", "staffing:manage"] },
  board: { key: "board", label: "My Board", href: "/board", icon: "board", perm: "dashboard:read", module: "PROJECTS" },
  portfolios: { key: "portfolios", label: "Portfolios", href: "/portfolios", icon: "layers", perm: "portfolio:read", module: "PORTFOLIOS" },
  projects: { key: "projects", label: "Projects", href: "/projects", icon: "folder", perm: "project:read", module: "PROJECTS" },
  ideas: { key: "ideas", label: "Ideas", href: "/ideas", icon: "bulb", perm: "idea:create", module: "IDEAS" },
  risks: { key: "risks", label: "Risks & Issues", href: "/risks", icon: "alert", perm: "risk:read", module: "RISKS" },
  people: { key: "people", label: "People", href: "/people", icon: "users", perm: "project:read", module: "TEAMS" },
  reports: { key: "reports", label: "Reports", href: "/reports", icon: "chart", perm: "reports:read", module: "REPORTS" },
  // UX6 (D13): a Member's Reports page is Custom reports over their own work only, so it is
  // gated on a permission every Member holds; the weekly views stay behind reports:read.
  myReports: { key: "reports", label: "Reports", href: "/reports", icon: "chart", perm: "dashboard:read", module: "REPORTS" },
  admin: { key: "admin", label: "Admin", href: "/admin", icon: "shield", perm: "admin:access", module: "ADMIN_IAM" },
  configs: { key: "configs", label: "Configs", href: "/configs", icon: "filter", perm: "admin:access" },
  // Super Admin's Administration group: the admin sections promoted into the sidebar.
  accessRequests: { key: "access-requests", label: "Access requests", href: "/admin/access-requests", icon: "inbox", perm: "iam:manage", module: "ADMIN_IAM" },
  users: { key: "users", label: "Users", href: "/admin/users", icon: "user", perm: "admin:access", module: "ADMIN_IAM" },
  teams: { key: "teams", label: "Teams", href: "/admin/teams", icon: "users", perm: "admin:access", module: "ADMIN_IAM" },
  roles: { key: "roles", label: "Roles & permissions", href: "/admin/roles", icon: "key", perm: "admin:access", module: "ADMIN_IAM" },
  departments: { key: "departments", label: "Departments", href: "/admin/departments", icon: "building", perm: "admin:access", module: "ADMIN_IAM" },
  organisation: { key: "organisation", label: "Organisation", href: "/admin/organisation", icon: "compass", perm: "admin:access", module: "ADMIN_IAM" },
  audit: { key: "audit", label: "Audit log", href: "/admin/audit", icon: "history", perm: "iam:manage", module: "ADMIN_IAM" },
} satisfies Record<string, MenuItem>;

export const ROLE_MENUS: Record<ViewRole, MenuGroup[]> = {
  PlatformSuperAdmin: [
    { label: "Work", items: [I.home, I.approvals, I.accessRequests] },
    { label: "Delivery", items: [I.portfolios, I.projects, I.risks, I.people] },
    { label: "Administration", items: [I.users, I.teams, I.roles, I.departments, I.organisation, I.configs, I.audit] },
    { label: "Reports", items: [I.reports] },
  ],
  HeadOfProjects: [
    { label: "Work", items: [I.home, I.approvals, I.board] },
    { label: "Delivery", items: [I.portfolios, I.projects, I.ideas, I.risks] },
    { label: "Team", items: [I.people] },
    { label: "Reports", items: [I.reports] },
    { label: "Admin", items: [I.admin, I.configs] },
  ],
  HeadOfQA: [
    { label: "Work", items: [I.home, I.board] },
    { label: "Delivery", items: [I.projects, I.portfolios, I.risks] },
    { label: "Team", items: [I.people] },
    { label: "Reports", items: [I.reports] },
    { label: "Admin", items: [I.admin, I.configs] },
  ],
  Executive: [
    { label: "Overview", items: [I.home] },
    { label: "Portfolio", items: [I.portfolios, I.projects, I.ideas, I.risks] },
    { label: "Reports", items: [I.reports] },
  ],
  ProjectManager: [
    { label: "Work", items: [I.home, I.board] },
    { label: "Delivery", items: [I.projects, I.risks, I.ideas, I.portfolios] },
    { label: "Team", items: [I.people] },
    { label: "Reports", items: [I.reports] },
  ],
  Member: [
    { label: "Work", items: [I.home, I.board] },
    { label: "Delivery", items: [I.projects] },
    { label: "Reports", items: [I.myReports] },
  ],
};

export interface MenuViewer {
  /** can(ctx, perm) for the signed-in person — their real permissions, whatever they view as. */
  can: (perm: string) => boolean;
  roles: readonly string[];
  /** module code → allowedRoles from the app_module registry; absent = skip module gating. */
  moduleAllowedRoles?: Record<string, readonly string[]>;
}

/** The item's own gate: its one `perm`, or any of its `anyPerm` (an empty list opens to no one). */
export function canOpenItem(item: MenuGate, viewer: Pick<MenuViewer, "can">): boolean {
  if (item.anyPerm) return item.anyPerm.some((p) => viewer.can(p));
  return viewer.can(item.perm);
}

/** The role's menu with every item the viewer can't open removed, and empty groups dropped. */
export function menuFor(viewRole: ViewRole, viewer: MenuViewer): MenuGroup[] {
  return ROLE_MENUS[viewRole]
    .map((g) => ({
      label: g.label,
      items: g.items.filter((item) => {
        if (!canOpenItem(item, viewer)) return false;
        const allowed = item.module ? viewer.moduleAllowedRoles?.[item.module] : undefined;
        if (allowed && allowed.length > 0 && !viewer.roles.some((r) => allowed.includes(r))) return false;
        return true;
      }),
    }))
    .filter((g) => g.items.length > 0);
}

/** The one active item: the longest href the path sits under ("/admin/users" beats "/admin"). */
export function activeMenuKey(pathname: string, groups: readonly MenuGroup[]): string | null {
  let best: MenuItem | null = null;
  for (const g of groups) {
    for (const item of g.items) {
      const hit = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (hit && (!best || item.href.length > best.href.length)) best = item;
    }
  }
  return best?.key ?? null;
}

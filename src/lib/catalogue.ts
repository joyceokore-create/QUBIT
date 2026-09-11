// The RBAC catalogue as data (tuma's AppModuleEnum + AppPermissionEnum, as TS). This is the
// SINGLE source of truth that `syncCatalogue` mirrors into the global `app_module` and
// `permission` tables, and that the roles UI groups by. Keep this file dependency-free of
// rbac.ts — rbac.ts derives PERMISSION_CATALOGUE FROM here, so importing back would cycle.
//
// `allowedRoles` gates which canonical roles may reach a module's nav/section (tuma's
// app_modules.allowed_user_types). Role names are the canonical role strings from rbac.ts;
// they are stable identifiers, repeated here as literals to keep the import one-way.

const ALL_ROLES = [
  "PlatformSuperAdmin",
  "HeadOfProjects",
  "HeadOfQA",
  "Executive",
  "ProjectManager",
  "Member",
] as const;

const ADMIN_ROLES = ["PlatformSuperAdmin", "HeadOfProjects", "HeadOfQA"] as const;

export interface AppModuleDef {
  code: string;
  name: string;
  description: string;
  allowedRoles: readonly string[];
}

// Feature areas. Each permission below belongs to exactly one of these (tuma's module→
// permission FK). `allowedRoles` is permissive for delivery areas (matches today's nav,
// where only Admin was role-gated) and restricted for Admin & IAM.
export const APP_MODULES: readonly AppModuleDef[] = [
  { code: "DASHBOARD", name: "Dashboard", description: "Operational dashboards", allowedRoles: ALL_ROLES },
  { code: "PORTFOLIOS", name: "Portfolios & programmes", description: "Portfolio and programme structure", allowedRoles: ALL_ROLES },
  { code: "PROJECTS", name: "Projects & delivery", description: "Projects, tasks, milestones, documents", allowedRoles: ALL_ROLES },
  { code: "RISKS", name: "Risks & issues", description: "RAID register — risks, issues, blockers", allowedRoles: ALL_ROLES },
  { code: "IDEAS", name: "Ideas", description: "Idea intake and triage", allowedRoles: ALL_ROLES },
  { code: "REPORTS", name: "Reports", description: "Reporting and workload queries", allowedRoles: ALL_ROLES },
  { code: "BUDGET", name: "Budget", description: "Budget visibility", allowedRoles: ALL_ROLES },
  { code: "TEAMS", name: "Teams & people", description: "Teams, staffing and org structure", allowedRoles: ALL_ROLES },
  { code: "ADMIN_IAM", name: "Admin & IAM", description: "Users, roles, modules and audit", allowedRoles: ADMIN_ROLES },
] as const;

export interface CataloguePermissionDef {
  code: string;
  actionName: string;
  module: string; // an AppModuleDef.code
}

// Every entry from the former flat PERMISSION_CATALOGUE, now tagged with its module, plus the
// three self-referential catalogue permissions (tuma's APP_MODULES_* / PERMISSIONS_VIEW).
export const CATALOGUE_PERMISSIONS: readonly CataloguePermissionDef[] = [
  // Dashboard
  { code: "dashboard:read", actionName: "View dashboard", module: "DASHBOARD" },
  // Portfolios & programmes
  { code: "portfolio:read", actionName: "View portfolios", module: "PORTFOLIOS" },
  { code: "programme:read", actionName: "View programmes", module: "PORTFOLIOS" },
  // Projects & delivery
  { code: "project:read", actionName: "View projects", module: "PROJECTS" },
  { code: "project:create", actionName: "Create project", module: "PROJECTS" },
  { code: "project:write", actionName: "Edit any project", module: "PROJECTS" },
  { code: "project:update", actionName: "Update project (legacy write)", module: "PROJECTS" },
  { code: "project:stage", actionName: "Edit governance fields (stage/priority)", module: "PROJECTS" },
  { code: "project:join:request", actionName: "Request to join a project", module: "PROJECTS" },
  { code: "milestone:read", actionName: "View milestones", module: "PROJECTS" },
  { code: "milestone:write", actionName: "Edit milestones", module: "PROJECTS" },
  { code: "task:read", actionName: "View tasks", module: "PROJECTS" },
  { code: "task:write", actionName: "Edit tasks", module: "PROJECTS" },
  { code: "document:read", actionName: "View documents", module: "PROJECTS" },
  // Risks & issues
  { code: "risk:read", actionName: "View risks", module: "RISKS" },
  { code: "risk:write", actionName: "Edit risks", module: "RISKS" },
  { code: "issue:read", actionName: "View issues", module: "RISKS" },
  { code: "issue:write", actionName: "Edit issues", module: "RISKS" },
  { code: "blocker:read", actionName: "View blockers", module: "RISKS" },
  { code: "blocker:write", actionName: "Edit blockers", module: "RISKS" },
  // Ideas
  { code: "idea:create", actionName: "Submit an idea", module: "IDEAS" },
  { code: "idea:triage", actionName: "Triage ideas", module: "IDEAS" },
  // Reports
  { code: "reports:read", actionName: "View reports", module: "REPORTS" },
  { code: "report:resource:self", actionName: "Report on own workload", module: "REPORTS" },
  { code: "report:resource:others", actionName: "Report on any workload", module: "REPORTS" },
  { code: "report:portfolio", actionName: "View portfolio/project reports", module: "REPORTS" },
  // Budget
  { code: "budget:read", actionName: "View budgets", module: "BUDGET" },
  // Teams & people
  { code: "teams:create", actionName: "Create a team", module: "TEAMS" },
  { code: "teams:manage:own", actionName: "Manage own teams", module: "TEAMS" },
  { code: "teams:manage:all", actionName: "Manage all teams", module: "TEAMS" },
  // Admin & IAM
  { code: "admin:access", actionName: "Access the admin console", module: "ADMIN_IAM" },
  { code: "users:invite", actionName: "Invite users", module: "ADMIN_IAM" },
  { code: "users:create", actionName: "Create users", module: "ADMIN_IAM" },
  { code: "users:suspend", actionName: "Suspend / reactivate users", module: "ADMIN_IAM" },
  { code: "users:roles", actionName: "Edit user roles", module: "ADMIN_IAM" },
  { code: "users:reset", actionName: "Reset user passwords", module: "ADMIN_IAM" },
  { code: "roles:manage", actionName: "Edit role permission sets", module: "ADMIN_IAM" },
  { code: "departments:manage", actionName: "Manage departments", module: "ADMIN_IAM" },
  { code: "app_modules:read", actionName: "View app modules", module: "ADMIN_IAM" },
  { code: "app_modules:update", actionName: "Update app modules", module: "ADMIN_IAM" },
  { code: "permissions:read", actionName: "View the permission catalogue", module: "ADMIN_IAM" },
] as const;

/** Flat list of permission codes — the shape rbac.ts re-exports as PERMISSION_CATALOGUE. */
export const CATALOGUE_PERMISSION_CODES: readonly string[] = CATALOGUE_PERMISSIONS.map((p) => p.code);

/** module code → its display name, for the picker/UI. */
export const MODULE_NAME = new Map(APP_MODULES.map((m) => [m.code, m.name]));

// Canonical role → permission mapping (docs/07-auth-rbac.md, PROMPT §1–§2).
//
// Model: "GLOBAL READ, SCOPED WRITE". Every authenticated user may READ all portfolios,
// projects, tasks, risks, blockers, milestones and docs in their tenant (RLS still scopes
// to the tenant). WRITE is scoped: some writes are granted at the ROLE level here; the
// resource-scoped ones ("edit THIS project because I lead it", "report on a person in MY
// project", "budget for MY project", "QA edits a task in Testing/UAT") are decided by the
// async helpers in src/lib/access.ts, which read membership under RLS and NEVER trust a
// client-supplied scope. `can()` below answers only the role-level question.
//
// Permissions are colon-delimited "resource:action[:qualifier]" strings; "*" matches
// anything (see matchesPermission), so a grant of "*" is full access and "teams:*" grants
// every teams action.
//
// TRANSITIONAL KEYS: existing write routes are still gated on the coarse legacy
// "project:update" (project + sub-resources + /v1 surface) and "iam:manage" (admin). Phase 1
// preserves those by granting them to the appropriate canonical roles; each route migrates
// to the finer-grained new keys / src/lib/access.ts helpers in its own phase (see DECISIONS.md).
import type { TenantContext } from "@/lib/tenant";

/** The six tenant roles the product consolidated to (PROMPT §1). Multi-role users allowed. */
export const CANONICAL_ROLES = [
  "PlatformSuperAdmin", // Superadmin — full admin console, all write access
  "HeadOfProjects", // PMO lead — delivery governance across all projects
  "HeadOfQA", // QA lead — quality governance across all projects
  "Executive", // read-everything, no admin, no user management
  "ProjectManager", // runs the projects they lead / are PM-member of
  "Member", // executes assigned work (default role)
] as const;
export type CanonicalRole = (typeof CANONICAL_ROLES)[number];

// Global read + universal capabilities — granted to EVERY canonical role.
const BASE: string[] = [
  // Global read (read-all world within the tenant).
  "dashboard:read",
  "portfolio:read",
  "programme:read",
  "project:read",
  "risk:read",
  "issue:read",
  "task:read",
  "blocker:read",
  "milestone:read",
  "document:read",
  // Universal capabilities.
  "teams:create", // anyone can create a team (creator becomes its lead)
  "project:join:request", // anyone can request to join a project (lead/PM approves)
  "report:resource:self", // anyone can report on their own workload
  "report:portfolio", // portfolio + project reports are read-all world
];

// Risk / issue / blocker authoring for management roles. Resource owners and a project's
// lead/PM also get these for their own items via src/lib/access.ts (not modelled here).
const MANAGE_RAID: string[] = [
  "risk:write",
  "risk:create",
  "risk:update",
  "issue:write",
  "issue:create",
  "issue:update",
  "blocker:write",
];

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  // Full access. "*" matches every permission (matchesPermission), so this covers
  // admin:access, users:*, project:*, iam:manage, budget:read, etc.
  PlatformSuperAdmin: ["*"],

  // PMO lead — delivery governance across ALL projects.
  HeadOfProjects: [
    ...BASE,
    "reports:read",
    "admin:access",
    "users:invite",
    "teams:manage:all",
    "project:create",
    "project:write", // may edit any project (governance)
    "project:update", // transitional coarse write key for existing routes (see file header)
    "milestone:write",
    "task:write",
    "budget:read",
    "report:resource:others",
    ...MANAGE_RAID,
    // departments:manage is scoped to the head's OWN department → src/lib/access.ts.
  ],

  // QA lead — quality governance across all projects. Note: project:write is NOT granted
  // at the role level (QA governs quality, not delivery scope); task:write on tasks in the
  // Testing/UAT phases is resource-scoped via src/lib/access.ts.
  HeadOfQA: [
    ...BASE,
    "reports:read",
    "admin:access",
    "users:invite",
    "teams:manage:all",
    "project:create",
    "budget:read",
    "report:resource:others",
    ...MANAGE_RAID,
  ],

  // Read-everything executive. No admin, no user management, no authoring.
  Executive: [
    ...BASE,
    "reports:read",
    "budget:read",
    "report:resource:others", // may query any person's workload / any project report
  ],

  // Runs their own projects. project:write / budget:read / report:resource:others are
  // granted per-project by src/lib/access.ts (only for projects they lead or PM-member).
  ProjectManager: [
    ...BASE,
    "reports:read",
    "project:create",
    "project:update", // transitional coarse write key for existing routes (see file header)
    "milestone:write",
    "task:write",
    ...MANAGE_RAID,
  ],

  // Executes assigned work. Writes to their own tasks / owned risks & blockers and join
  // requests are all resource-scoped via src/lib/access.ts.
  Member: [...BASE],
};

/** The fixed, browsable permission catalogue (FR-IAM-04). Extend as new modules land. */
export const PERMISSION_CATALOGUE = [
  // Reads
  "dashboard:read",
  "portfolio:read",
  "programme:read",
  "project:read",
  "risk:read",
  "issue:read",
  "task:read",
  "blocker:read",
  "milestone:read",
  "document:read",
  "reports:read",
  // Admin & IAM
  "admin:access",
  "users:invite",
  "users:create",
  "users:suspend",
  "users:roles",
  "users:reset",
  "roles:manage", // edit role → permission sets (PlatformSuperAdmin only)
  "departments:manage",
  // Teams
  "teams:create",
  "teams:manage:own",
  "teams:manage:all",
  // Projects & delivery
  "project:create",
  "project:write",
  "project:update",
  "project:join:request",
  "milestone:write",
  "task:write",
  "risk:write",
  "issue:write",
  "blocker:write",
  // Budget & reporting
  "budget:read",
  "report:resource:self",
  "report:resource:others",
  "report:portfolio",
] as const;

export interface Scope {
  type: "portfolio" | "orgUnit" | "project" | "department";
  id: string;
}

/**
 * Segment-wise permission match with "*" wildcards. A granted "*" segment matches any
 * single requested segment, and a trailing "*" matches all remaining segments — so:
 *   "*"                    matches everything            (PlatformSuperAdmin)
 *   "teams:*"              matches "teams:manage:own"
 *   "*:read"               matches "project:read" (but not "project:create")
 *   "users:invite"         does NOT match "users:create"
 *   "report:resource:self" does NOT match "report:resource:others"
 */
function matchesPermission(granted: string, requested: string): boolean {
  if (granted === requested) return true;
  const g = granted.split(":");
  const r = requested.split(":");
  for (let i = 0; i < g.length; i++) {
    if (g[i] === "*") {
      if (i === g.length - 1) return true; // trailing "*" → matches the rest
      if (i >= r.length) return false;
      continue; // "*" matches exactly this segment
    }
    if (i >= r.length || g[i] !== r[i]) return false;
  }
  return g.length === r.length;
}

/**
 * Resolves whether the current session's roles grant `permission` AT THE ROLE LEVEL.
 * Roles come from the session (TenantContext), never from the client. Resource-scoped
 * writes (own project / own department / owned item / QA phase) are decided by the async
 * helpers in src/lib/access.ts, which layer ON TOP of this — a role denied here may still
 * be granted for a specific resource it owns or leads.
 *
 * `scope` is accepted for forward compatibility with scoped role assignments
 * (portfolio/orgUnit/project/department); tenant-wide assignments don't use it yet.
 */
export function can(ctx: TenantContext, permission: string, _scope?: Scope): boolean {
  // When the session carries resolved effective permissions (baked at login, honouring any
  // tenant role-permission overrides — Phase 1.5), use them directly. Otherwise fall back to
  // the code role → permission defaults (tests, internal ctx, and pre-existing sessions).
  if (ctx.permissions) {
    return ctx.permissions.some((granted) => matchesPermission(granted, permission));
  }
  return ctx.roles.some((role) => {
    const grants = ROLE_PERMISSIONS[role];
    if (!grants) return false;
    return grants.some((granted) => matchesPermission(granted, permission));
  });
}

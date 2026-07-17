import { describe, expect, it } from "vitest";
import { can, CANONICAL_ROLES } from "@/lib/rbac";
import type { TenantContext } from "@/lib/tenant";

// ── Permission matrix (PROMPT-personalized-dashboards §2, §8) ────────────────────
// The spine of the personalized-dashboards work: for each canonical role × action,
// assert the *role-level* allow/deny of `can()`. Written FIRST (red) against the old
// role set, then made green by the canonical rbac rewrite.
//
// SCOPE NOTE: this covers the decisions `can()` makes from the session's roles ALONE.
// The resource-scoped rows of §2 — "project lead / PM-member of THIS project",
// "HeadOfQA on tasks in Testing|UAT", "PM about their own project's members",
// "budget for the PM's own project", "department head of THEIR department" — are NOT
// role-level; they are enforced by the async helpers in src/lib/access.ts and are
// tested there / at the API layer (tests/rls) as each phase builds the routes. Those
// helpers are additive: a role that is denied here may still be granted for a specific
// resource it owns/leads. See DECISIONS.md (permission-matrix layering).

function ctx(...roles: string[]): TenantContext {
  return { tenantId: "t1", userId: "u1", roles };
}

const ROLES = {
  psa: "PlatformSuperAdmin",
  hop: "HeadOfProjects",
  hoqa: "HeadOfQA",
  exec: "Executive",
  pm: "ProjectManager",
  member: "Member",
} as const;

// Y = allowed at the role level, N = denied at the role level.
// Order of columns: PSA, HeadOfProjects, HeadOfQA, Executive, ProjectManager, Member.
type Row = [action: string, psa: boolean, hop: boolean, hoqa: boolean, exec: boolean, pm: boolean, member: boolean];
const Y = true;
const N = false;

const MATRIX: Row[] = [
  // Global read + universal capabilities — everyone.
  ["dashboard:read", Y, Y, Y, Y, Y, Y],
  ["project:read", Y, Y, Y, Y, Y, Y],
  ["portfolio:read", Y, Y, Y, Y, Y, Y],
  ["risk:read", Y, Y, Y, Y, Y, Y],
  ["issue:read", Y, Y, Y, Y, Y, Y],
  ["task:read", Y, Y, Y, Y, Y, Y],
  ["report:portfolio", Y, Y, Y, Y, Y, Y],
  ["report:resource:self", Y, Y, Y, Y, Y, Y],
  ["teams:create", Y, Y, Y, Y, Y, Y],
  ["project:join:request", Y, Y, Y, Y, Y, Y],

  // Admin console visibility — SuperAdmin + both heads only.
  ["admin:access", Y, Y, Y, N, N, N],
  ["users:invite", Y, Y, Y, N, N, N],
  ["teams:manage:all", Y, Y, Y, N, N, N],

  // User management writes — SuperAdmin ONLY.
  ["users:create", Y, N, N, N, N, N],
  ["users:suspend", Y, N, N, N, N, N],
  ["users:roles", Y, N, N, N, N, N],
  ["users:reset", Y, N, N, N, N, N],

  // Project creation — SuperAdmin, both heads, ProjectManager.
  ["project:create", Y, Y, Y, N, Y, N],

  // Project write at the ROLE level — SuperAdmin + HeadOfProjects (delivery
  // governance). PM / project lead get it per-project via the helper, so N here.
  ["project:write", Y, Y, N, N, N, N],

  // Budget read — SuperAdmin, Executive, both heads. Hidden from Member; PM gets it
  // for their own project via the helper, so N at the role level.
  ["budget:read", Y, Y, Y, Y, N, N],

  // Reporting on ANOTHER named person's workload — SuperAdmin, Executive, both heads
  // (any person). PM only for their own project members (helper) → N here.
  ["report:resource:others", Y, Y, Y, Y, N, N],

  // Risk / blocker write — management roles (owner/lead of a specific project also get
  // it via the helper). Executive is read-only; Member writes only what they own (helper).
  ["risk:write", Y, Y, Y, N, Y, N],
  ["blocker:write", Y, Y, Y, N, Y, N],

  // Reports centre / management reports (transitional legacy key) — all management roles
  // incl. ProjectManager, but NOT plain Members (they get self-reports via report:*:self).
  ["reports:read", Y, Y, Y, Y, Y, N],
];

const COLS: (keyof typeof ROLES)[] = ["psa", "hop", "hoqa", "exec", "pm", "member"];

describe("permission matrix — canonical roles × actions (role-level)", () => {
  it("defines exactly the six canonical roles", () => {
    expect([...CANONICAL_ROLES].sort()).toEqual(
      [ROLES.psa, ROLES.hop, ROLES.hoqa, ROLES.exec, ROLES.pm, ROLES.member].sort(),
    );
  });

  for (const row of MATRIX) {
    const [action, ...expected] = row;
    COLS.forEach((col, i) => {
      const role = ROLES[col];
      const allow = expected[i];
      it(`${allow ? "allows" : "denies"} ${role} → ${action}`, () => {
        expect(can(ctx(role), action)).toBe(allow);
      });
    });
  }

  it("PlatformSuperAdmin is a superset — allowed on every action in the matrix", () => {
    for (const [action] of MATRIX) {
      expect(can(ctx(ROLES.psa), action)).toBe(true);
    }
  });

  it("unions permissions across multiple assigned roles", () => {
    // A user who is both Executive and ProjectManager can both create projects (PM) and
    // read budgets / report on anyone (Executive).
    const both = ctx(ROLES.exec, ROLES.pm);
    expect(can(both, "project:create")).toBe(true);
    expect(can(both, "budget:read")).toBe(true);
    expect(can(both, "report:resource:others")).toBe(true);
  });

  it("denies everything for an unrecognized role", () => {
    expect(can(ctx("NotARole"), "project:read")).toBe(false);
    expect(can(ctx("NotARole"), "dashboard:read")).toBe(false);
  });
});

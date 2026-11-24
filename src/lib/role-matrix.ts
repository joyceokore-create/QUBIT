import { grantsPermission } from "@/lib/rbac";

/**
 * UX fidelity Tier 3 — the Roles & Permissions matrix (design: Permission × the six roles).
 * Pure and client-safe. Every cell is READ FROM the role's effective permission set (code
 * default + Riverbank's stored override), never hard-coded, so the matrix can't drift from
 * what the server actually enforces.
 *
 * `scoped` covers grants decided per resource by src/lib/access.ts: a role without the
 * role-level permission but holding `via` gets the grant for the records it owns ("Own
 * projects"), which is what the server does for a Project Manager on gates and budgets.
 */
export interface MatrixRowDef {
  label: string;
  /** All of these must be granted for a ✓. */
  all: string[];
  scoped?: { via: string; note: string };
}

export const ROLE_MATRIX_ROWS: MatrixRowDef[] = [
  { label: "Read all portfolios and projects", all: ["portfolio:read", "project:read"] },
  { label: "Create a project", all: ["project:create"] },
  { label: "Update stage gates", all: ["project:stage"], scoped: { via: "project:update", note: "Own projects" } },
  { label: "Edit any project", all: ["project:write"], scoped: { via: "project:update", note: "Own projects" } },
  { label: "See budgets", all: ["budget:read"], scoped: { via: "project:update", note: "Own projects" } },
  { label: "Triage ideas", all: ["idea:triage"] },
  { label: "Raise risks and issues", all: ["risk:create", "issue:create"] },
  { label: "Invite users", all: ["users:invite"] },
  { label: "Assign roles and reset MFA", all: ["users:roles", "users:reset"] },
  { label: "View the audit log", all: ["iam:manage"] },
];

export type MatrixCell = { kind: "yes" } | { kind: "no" } | { kind: "scoped"; note: string };

export function matrixCell(permissions: readonly string[], row: MatrixRowDef): MatrixCell {
  if (row.all.every((p) => grantsPermission(permissions, p))) return { kind: "yes" };
  if (row.scoped && grantsPermission(permissions, row.scoped.via)) return { kind: "scoped", note: row.scoped.note };
  return { kind: "no" };
}

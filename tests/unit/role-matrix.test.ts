import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS } from "@/lib/rbac";
import { ROLE_MATRIX_ROWS, matrixCell } from "@/lib/role-matrix";

// UX fidelity Tier 3 — the Roles & Permissions matrix reads each role's effective permissions.
const row = (label: string) => {
  const r = ROLE_MATRIX_ROWS.find((x) => x.label === label);
  if (!r) throw new Error(`no row ${label}`);
  return r;
};
const cell = (role: string, label: string) => matrixCell(ROLE_PERMISSIONS[role], row(label));

describe("role matrix", () => {
  it("Super Admin's wildcard grants every row", () => {
    for (const r of ROLE_MATRIX_ROWS) expect(matrixCell(["*"], r)).toEqual({ kind: "yes" });
  });

  it("everyone can read all portfolios and projects", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) expect(cell(role, "Read all portfolios and projects").kind).toBe("yes");
  });

  it("a Project Manager sees budgets and updates gates on their own projects only", () => {
    expect(cell("ProjectManager", "See budgets")).toEqual({ kind: "scoped", note: "Own projects" });
    expect(cell("ProjectManager", "Update stage gates")).toEqual({ kind: "scoped", note: "Own projects" });
    expect(cell("ProjectManager", "Create a project").kind).toBe("yes");
  });

  it("only the Head triages ideas; nobody but Super Admin assigns roles or sees the audit log", () => {
    expect(cell("HeadOfProjects", "Triage ideas").kind).toBe("yes");
    expect(cell("HeadOfQA", "Triage ideas").kind).toBe("no");
    for (const role of ["HeadOfProjects", "HeadOfQA", "Executive", "ProjectManager", "Member"]) {
      expect(cell(role, "Assign roles and reset MFA").kind).toBe("no");
      expect(cell(role, "View the audit log").kind).toBe("no");
    }
  });

  it("a Member has no write rows, and a stored override is what the matrix shows", () => {
    for (const r of ROLE_MATRIX_ROWS.slice(1)) expect(cell("Member", r.label).kind).toBe("no");
    expect(matrixCell([...ROLE_PERMISSIONS.Member, "budget:read"], row("See budgets")).kind).toBe("yes");
  });
});

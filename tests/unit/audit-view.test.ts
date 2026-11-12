// UX fidelity Tier 2 — Audit Log in plain words. The Before → after column comes from an
// allow-list, so secrets in an audit row can never be shown (plan R7).
import { describe, expect, it } from "vitest";
import { auditActionLabel, auditActionOptions, auditChange } from "@/lib/audit-view";

describe("audit view", () => {
  it("names actions in plain words", () => {
    expect(auditActionLabel("role_grant", "user")).toBe("Role added");
    expect(auditActionLabel("update", "project")).toBe("Project changed");
    expect(auditActionLabel("create", "access_request")).toBe("Access request created");
    expect(auditActionLabel("mfa_reminder", "tenant")).toBe("MFA reminder sent");
  });

  it("offers Role changes first when role rows exist", () => {
    expect(auditActionOptions(["create", "role_grant"])[0]).toEqual({ value: "role_changes", label: "Role changes" });
    expect(auditActionOptions(["create"]).some((o) => o.value === "role_changes")).toBe(false);
  });

  it("reads role changes as before → after with role names", () => {
    expect(auditChange("role_grant", null, { role: "ProjectManager" })).toBe("— → Project Manager");
    expect(auditChange("role_revoke", { role: "Executive" }, null)).toBe("Executive → —");
    expect(auditChange("update", { status: "ACTIVE" }, { status: "SUSPENDED" })).toBe("Status: ACTIVE → SUSPENDED");
  });

  it("never shows a field outside the allow-list (secrets, hashes, tokens)", () => {
    const out = auditChange("update", { passwordHash: "x", mfaSecret: "s", name: "A" }, { passwordHash: "y", mfaSecret: "t", tokenHash: "z", name: "B" });
    expect(out).toBe("Name: A → B");
    expect(out).not.toMatch(/passwordHash|mfaSecret|tokenHash|x|y|z|s\b|t\b/);
    expect(auditChange("update", { secret: { nested: 1 } }, { secret: { nested: 2 } })).toBe("");
  });
});

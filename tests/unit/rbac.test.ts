import { describe, expect, it } from "vitest";
import { can } from "@/lib/rbac";
import type { TenantContext } from "@/lib/tenant";

// Focused tests for the rbac MATCHER mechanics (wildcards + multi-segment keys). The full
// role × action policy table lives in permissions-matrix.test.ts; this file guards the
// matching rules that table relies on.
function ctxWithRoles(roles: string[]): TenantContext {
  return { tenantId: "t1", userId: "u1", roles };
}

describe("rbac.can() — matcher mechanics", () => {
  it("PlatformSuperAdmin's '*' grant matches any permission, at any depth", () => {
    const ctx = ctxWithRoles(["PlatformSuperAdmin"]);
    expect(can(ctx, "project:create")).toBe(true);
    expect(can(ctx, "iam:manage")).toBe(true); // legacy admin key still resolves
    expect(can(ctx, "users:create")).toBe(true);
    expect(can(ctx, "teams:manage:own")).toBe(true); // three-segment key
    expect(can(ctx, "report:resource:others")).toBe(true);
  });

  it("Member gets global reads + universal capabilities, but no authoring", () => {
    const ctx = ctxWithRoles(["Member"]);
    expect(can(ctx, "project:read")).toBe(true);
    expect(can(ctx, "report:portfolio")).toBe(true);
    expect(can(ctx, "report:resource:self")).toBe(true);
    expect(can(ctx, "teams:create")).toBe(true);
    expect(can(ctx, "project:join:request")).toBe(true);
    expect(can(ctx, "project:create")).toBe(false);
    expect(can(ctx, "budget:read")).toBe(false);
    expect(can(ctx, "reports:read")).toBe(false); // management-only
  });

  it("distinguishes same-prefix keys — a qualifier is not a wildcard", () => {
    const head = ctxWithRoles(["HeadOfProjects"]); // has users:invite, NOT users:create
    expect(can(head, "users:invite")).toBe(true);
    expect(can(head, "users:create")).toBe(false);
    expect(can(head, "users:suspend")).toBe(false);

    // report:resource:self (everyone) must never be mistaken for report:resource:others.
    const member = ctxWithRoles(["Member"]);
    expect(can(member, "report:resource:self")).toBe(true);
    expect(can(member, "report:resource:others")).toBe(false);
  });

  it("HeadOfQA governs quality but is not granted delivery project:write at the role level", () => {
    const ctx = ctxWithRoles(["HeadOfQA"]);
    expect(can(ctx, "admin:access")).toBe(true);
    expect(can(ctx, "risk:write")).toBe(true);
    expect(can(ctx, "project:write")).toBe(false); // resource-scoped only (Testing/UAT via helper)
  });

  it("unions permissions across multiple assigned roles", () => {
    const ctx = ctxWithRoles(["Member", "Executive"]);
    expect(can(ctx, "budget:read")).toBe(true); // from Executive
    expect(can(ctx, "teams:create")).toBe(true); // from base
  });

  it("denies everything for an unrecognized role", () => {
    const ctx = ctxWithRoles(["NotARole"]);
    expect(can(ctx, "project:read")).toBe(false);
    expect(can(ctx, "dashboard:read")).toBe(false);
  });
});

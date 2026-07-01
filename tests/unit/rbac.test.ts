import { describe, expect, it } from "vitest";
import { can } from "@/lib/rbac";
import type { TenantContext } from "@/lib/tenant";

function ctxWithRoles(roles: string[]): TenantContext {
  return { tenantId: "t1", userId: "u1", roles };
}

describe("rbac.can()", () => {
  it("grants SystemAdmin every permission via the wildcard", () => {
    const ctx = ctxWithRoles(["SystemAdmin"]);
    expect(can(ctx, "project:create")).toBe(true);
    expect(can(ctx, "iam:manage")).toBe(true);
    expect(can(ctx, "finance:read")).toBe(true);
  });

  it("restricts Viewer to read-only, on any resource", () => {
    const ctx = ctxWithRoles(["Viewer"]);
    expect(can(ctx, "project:read")).toBe(true);
    expect(can(ctx, "risk:read")).toBe(true);
    expect(can(ctx, "project:create")).toBe(false);
    expect(can(ctx, "risk:update")).toBe(false);
  });

  it("grants ProjectManager full project/risk/issue/task access but not finance or IAM", () => {
    const ctx = ctxWithRoles(["ProjectManager"]);
    expect(can(ctx, "project:create")).toBe(true);
    expect(can(ctx, "risk:update")).toBe(true);
    expect(can(ctx, "issue:read")).toBe(true);
    expect(can(ctx, "finance:read")).toBe(false);
    expect(can(ctx, "iam:manage")).toBe(false);
  });

  it("limits Contributor to task work plus creating (not updating) risks/issues", () => {
    const ctx = ctxWithRoles(["Contributor"]);
    expect(can(ctx, "task:update")).toBe(true);
    expect(can(ctx, "risk:create")).toBe(true);
    expect(can(ctx, "issue:create")).toBe(true);
    expect(can(ctx, "timesheet:submit")).toBe(true);
    expect(can(ctx, "risk:update")).toBe(false);
    expect(can(ctx, "project:create")).toBe(false);
  });

  it("scopes PlatformSuperAdmin to tenant switching only — no business-data authoring", () => {
    const ctx = ctxWithRoles(["PlatformSuperAdmin"]);
    expect(can(ctx, "tenant:switch")).toBe(true);
    expect(can(ctx, "project:read")).toBe(false);
    expect(can(ctx, "risk:read")).toBe(false);
  });

  it("unions permissions across multiple assigned roles", () => {
    const ctx = ctxWithRoles(["Contributor", "FinanceManager"]);
    expect(can(ctx, "timesheet:submit")).toBe(true);
    expect(can(ctx, "finance:read")).toBe(true);
  });

  it("denies everything for an unrecognized role", () => {
    const ctx = ctxWithRoles(["NotARole"]);
    expect(can(ctx, "project:read")).toBe(false);
  });
});

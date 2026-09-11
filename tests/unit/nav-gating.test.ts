import { describe, expect, it } from "vitest";
import { visibleNavItems } from "@/components/layout/nav-items";

const base = { canAccessAdmin: true, canStaff: true, memberOnly: false };

describe("nav module gating (app_module allowedRoles)", () => {
  it("is a no-op when no registry is supplied (today's behaviour)", () => {
    const items = visibleNavItems({ ...base });
    expect(items.some((i) => i.href === "/risks")).toBe(true);
  });

  it("hides a surface when the viewer holds none of the module's allowedRoles", () => {
    const items = visibleNavItems({
      ...base,
      roles: ["Member"],
      moduleAllowedRoles: { RISKS: ["Executive"] }, // Member is not allowed on RISKS
    });
    expect(items.some((i) => i.href === "/risks")).toBe(false);
    // Untouched modules stay visible.
    expect(items.some((i) => i.href === "/projects")).toBe(true);
  });

  it("shows the surface when the viewer holds an allowed role", () => {
    const items = visibleNavItems({
      ...base,
      roles: ["Executive"],
      moduleAllowedRoles: { RISKS: ["Executive"] },
    });
    expect(items.some((i) => i.href === "/risks")).toBe(true);
  });

  it("an empty allowedRoles list does not hide the module (fail-open)", () => {
    const items = visibleNavItems({
      ...base,
      roles: ["Member"],
      moduleAllowedRoles: { RISKS: [] },
    });
    expect(items.some((i) => i.href === "/risks")).toBe(true);
  });
});

// M-W1a (docs/32 §0.3) — the one nav filter both shells consume.
import { describe, expect, it } from "vitest";
import { isMemberOnly, visibleNavItems } from "@/components/layout/nav-items";

const labels = (v: Parameters<typeof visibleNavItems>[0]) => visibleNavItems(v).map((n) => n.label);

describe("visibleNavItems", () => {
  it("members get the slim four: Dashboard · My Board · Projects · Reports", () => {
    expect(labels({ canAccessAdmin: false, canStaff: false, memberOnly: true })).toEqual([
      "Dashboard",
      "My Board",
      "Projects",
      "Reports",
    ]);
  });

  it("a PM keeps the estate views plus Staffing, without admin", () => {
    const pm = labels({ canAccessAdmin: false, canStaff: true, memberOnly: false });
    expect(pm).toContain("Portfolios");
    expect(pm).toContain("Programmes");
    expect(pm).toContain("Staffing");
    expect(pm).not.toContain("Admin");
    expect(pm).not.toContain("Teams");
  });

  it("an executive (no staffing, no admin) browses the estate but not Staffing", () => {
    const exec = labels({ canAccessAdmin: false, canStaff: false, memberOnly: false });
    expect(exec).toContain("Portfolios");
    expect(exec).toContain("Programmes");
    expect(exec).not.toContain("Staffing");
  });

  it("a Head gets everything", () => {
    const head = labels({ canAccessAdmin: true, canStaff: true, memberOnly: false });
    expect(head).toContain("Admin");
    expect(head).toContain("Teams");
    expect(head).toContain("Staffing");
    expect(head).toContain("Programmes");
  });
});

describe("isMemberOnly", () => {
  it("true only when every held group is a member category", () => {
    expect(isMemberOnly(["developer"])).toBe(true);
    expect(isMemberOnly(["qa", "implementor"])).toBe(true);
    expect(isMemberOnly(["developer", "pm"])).toBe(false);
    expect(isMemberOnly(["executive"])).toBe(false);
  });

  it("an empty persona list fails OPEN to the full nav", () => {
    expect(isMemberOnly([])).toBe(false);
  });
});

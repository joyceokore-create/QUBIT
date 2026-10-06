// M-W1a (docs/32 §0.3) — the one nav filter both shells consume.
import { describe, expect, it } from "vitest";
import { isMemberOnly, visibleNavItems } from "@/components/layout/nav-items";

const labels = (v: Parameters<typeof visibleNavItems>[0]) => visibleNavItems(v).map((n) => n.label);

describe("visibleNavItems", () => {
  // DM1.73 — back to docs/32 §0.3's slim four: Ideas is memberHidden now (the intake
  // form stays reachable for members via direct link; `idea:create` remains in BASE),
  // Programmes merged into Portfolios, and Staffing merged into People (?tab=requests).
  it("members get the slim four: Dashboard · My Board · Projects · Reports", () => {
    expect(labels({ canAccessAdmin: false, canStaff: false, memberOnly: true })).toEqual([
      "Dashboard",
      "My Board",
      "Projects",
      "Reports",
    ]);
  });

  it("a PM keeps the estate views, without admin", () => {
    const pm = labels({ canAccessAdmin: false, canStaff: true, memberOnly: false });
    expect(pm).toContain("Portfolios");
    // DM1.73: staffing requests live on People (?tab=requests); People is the pill.
    expect(pm).toContain("People");
    expect(pm).not.toContain("Programmes");
    expect(pm).not.toContain("Staffing");
    expect(pm).not.toContain("Admin");
    expect(pm).not.toContain("Teams");
  });

  it("an executive (no staffing, no admin) browses the estate", () => {
    const exec = labels({ canAccessAdmin: false, canStaff: false, memberOnly: false });
    expect(exec).toContain("Portfolios");
    expect(exec).toContain("People");
    expect(exec).not.toContain("Programmes"); // DM1.73 — merged into Portfolios
    expect(exec).not.toContain("Staffing"); // DM1.73 — merged into People
  });

  it("a Head gets everything", () => {
    const head = labels({ canAccessAdmin: true, canStaff: true, memberOnly: false });
    expect(head).toContain("Admin");
    // DM1.73 (T6): Teams lives inside the Admin sub-nav now — the top-level pill was a
    // dead end (nav gated admin:access, the page gated iam:manage).
    expect(head).not.toContain("Teams");
    // DM1.73: Programmes and Staffing pills are gone even for the Head — portfolios
    // and People (?tab=requests) carry those surfaces now.
    expect(head).not.toContain("Programmes");
    expect(head).not.toContain("Staffing");
    expect(head).toEqual([
      "Dashboard",
      "My Board",
      "Ideas",
      "Portfolios",
      "Projects",
      "Risks",
      "People",
      "Reports",
      "Admin",
    ]);
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

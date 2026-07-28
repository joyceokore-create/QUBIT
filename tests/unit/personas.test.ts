import { describe, expect, it } from "vitest";
import { derivedGroups, effectiveGroups, landingPersona } from "@/lib/personas";

describe("derivedGroups", () => {
  it("maps membership categories, oversight roles, and leadership", () => {
    expect(
      derivedGroups({ membershipCategories: ["Dev", "QA"], tenantRoles: ["Member"], leadsProjects: false }).sort(),
    ).toEqual(["developer", "qa"]);
    expect(derivedGroups({ membershipCategories: [], tenantRoles: ["HeadOfQA"], leadsProjects: false })).toEqual(["executive"]);
    expect(derivedGroups({ membershipCategories: [], tenantRoles: ["Member"], leadsProjects: true })).toEqual(["pm"]);
  });

  it("gives stakeholders no group of their own", () => {
    expect(derivedGroups({ membershipCategories: ["Stakeholder"], tenantRoles: ["Member"], leadsProjects: false })).toEqual([]);
  });
});

describe("effectiveGroups", () => {
  it("unions declared with derived, priority-ordered", () => {
    expect(effectiveGroups(["qa"], ["pm"])).toEqual(["pm", "qa"]);
    expect(effectiveGroups(["developer", "executive"], ["developer"])).toEqual(["executive", "developer"]);
  });

  it("drops unknown declared values instead of storing junk", () => {
    expect(effectiveGroups(["superuser", "qa"], [])).toEqual(["qa"]);
  });
});

describe("landingPersona", () => {
  it("prefers last-used, then primary, then priority", () => {
    expect(landingPersona(["executive", "pm", "qa"], "pm", "qa")).toBe("qa");
    expect(landingPersona(["executive", "pm", "qa"], "pm", null)).toBe("pm");
    expect(landingPersona(["executive", "pm", "qa"], null, null)).toBe("executive");
  });

  it("ignores a last/primary the user no longer holds", () => {
    expect(landingPersona(["developer"], "executive", "pm")).toBe("developer");
  });

  it("falls back to developer for a user with no groups (pure stakeholder)", () => {
    expect(landingPersona([], null, null)).toBe("developer");
  });
});

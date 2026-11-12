// UX plan D2a — "Viewing as": role order, landing, who sees the switch, custom-role fallback.
import { describe, expect, it } from "vitest";
import { heldBusinessRoles, isPreviewing, landingViewRole, showViewSwitch, VIEW_ROLE_LEVEL, VIEW_ROLE_REPORTS, viewRoleOptions } from "@/lib/view-roles";

describe("role order and landing", () => {
  it("orders Executive → Head → Head of QA → PM → Member and lands on the highest", () => {
    const roles = ["Member", "ProjectManager", "HeadOfQA", "Executive"];
    expect(heldBusinessRoles(roles)).toEqual(["Executive", "HeadOfQA", "ProjectManager", "Member"]);
    expect(landingViewRole(roles)).toBe("Executive");
    // The old resolveLevel ranked the Heads above Executive; D2a doesn't.
    expect(landingViewRole(["HeadOfProjects", "Executive"])).toBe("Executive");
  });

  it("a saved choice wins while it's still a role the person may view as", () => {
    expect(landingViewRole(["Executive", "ProjectManager"], "ProjectManager")).toBe("ProjectManager");
    // Lost the role since? Back to the highest held.
    expect(landingViewRole(["Executive"], "ProjectManager")).toBe("Executive");
    expect(landingViewRole(["Executive"], "nonsense")).toBe("Executive");
  });

  it("Super Admin sits outside the order", () => {
    expect(landingViewRole(["PlatformSuperAdmin"])).toBe("PlatformSuperAdmin");
    // With a business role too, they land on that role's home (Admin one click away).
    expect(landingViewRole(["PlatformSuperAdmin", "HeadOfProjects"])).toBe("HeadOfProjects");
    expect(viewRoleOptions(["PlatformSuperAdmin"])).toEqual(["PlatformSuperAdmin", "Executive", "HeadOfProjects", "HeadOfQA", "ProjectManager", "Member"]);
  });

  it("custom roles get the Member layout (Q4)", () => {
    expect(heldBusinessRoles(["Implementor Lead"])).toEqual(["Member"]);
    expect(heldBusinessRoles(["ProjectManager", "Auditor"])).toEqual(["ProjectManager", "Member"]);
    expect(heldBusinessRoles([])).toEqual(["Member"]);
  });
});

describe("who sees the switch", () => {
  it("only Super Admin and people with more than one role", () => {
    expect(showViewSwitch(["ProjectManager"])).toBe(false);
    expect(showViewSwitch(["Member"])).toBe(false);
    expect(showViewSwitch(["ProjectManager", "Member"])).toBe(true);
    expect(showViewSwitch(["PlatformSuperAdmin"])).toBe(true);
  });
  it("offers only roles the person holds (no escalation by URL or menu)", () => {
    expect(viewRoleOptions(["ProjectManager", "Member"])).toEqual(["ProjectManager", "Member"]);
  });
});

describe("previewing and interim mapping", () => {
  it("is a preview only when Super Admin views a role they don't hold", () => {
    expect(isPreviewing(["PlatformSuperAdmin"], "ProjectManager")).toBe(true);
    expect(isPreviewing(["PlatformSuperAdmin"], "PlatformSuperAdmin")).toBe(false);
    expect(isPreviewing(["HeadOfProjects", "ProjectManager"], "ProjectManager")).toBe(false);
  });
  it("maps each role to today's cockpit level and report view until its home ships", () => {
    expect(VIEW_ROLE_LEVEL.HeadOfQA).toBe("head");
    expect(VIEW_ROLE_LEVEL.Member).toBe("user");
    expect(VIEW_ROLE_REPORTS.HeadOfQA).toBe("exec");
    expect(VIEW_ROLE_REPORTS.PlatformSuperAdmin).toBe("head");
  });
});

import { describe, expect, it } from "vitest";
import { primaryDashboard, accessibleDashboards, resolveView, DASHBOARDS } from "@/lib/dashboards";

describe("dashboards — role routing + composition (Phase 3)", () => {
  it("lands a user on their highest-priority role (SuperAdmin → Heads → Executive → PM → Member)", () => {
    expect(primaryDashboard(["Member"])).toBe("Member");
    expect(primaryDashboard(["ProjectManager", "Member"])).toBe("ProjectManager");
    expect(primaryDashboard(["Executive", "ProjectManager"])).toBe("Executive");
    expect(primaryDashboard(["HeadOfQA", "Executive", "ProjectManager"])).toBe("HeadOfQA");
    expect(primaryDashboard(["HeadOfProjects", "HeadOfQA"])).toBe("HeadOfProjects");
    expect(primaryDashboard(["PlatformSuperAdmin", "HeadOfProjects"])).toBe("PlatformSuperAdmin");
  });

  it("defaults to Member for an unknown / empty role set", () => {
    expect(primaryDashboard([])).toBe("Member");
    expect(primaryDashboard(["NotARole"])).toBe("Member");
  });

  it("Member lands on My Tasks; other roles compose on /dashboard", () => {
    expect(DASHBOARDS.Member.landing).toBe("/my-tasks");
    expect(DASHBOARDS.Executive.landing).toBe("/dashboard");
    expect(DASHBOARDS.PlatformSuperAdmin.landing).toBe("/dashboard");
  });

  it("lists accessible dashboards highest-first for multi-role users", () => {
    expect(accessibleDashboards(["ProjectManager", "Executive"])).toEqual(["Executive", "ProjectManager"]);
    expect(accessibleDashboards(["Member"])).toEqual(["Member"]);
    expect(accessibleDashboards([])).toEqual(["Member"]);
  });

  it("resolveView honours an allowed ?view and falls back to primary otherwise", () => {
    expect(resolveView(["Executive", "ProjectManager"], "ProjectManager")).toBe("ProjectManager");
    expect(resolveView(["Executive"], "PlatformSuperAdmin")).toBe("Executive"); // not allowed → primary
    expect(resolveView(["Member"], undefined)).toBe("Member");
    expect(resolveView(["ProjectManager"], "bogus")).toBe("ProjectManager");
  });

  it("every role dashboard carries the briefing hero; Executive is read-only", () => {
    for (const role of Object.keys(DASHBOARDS) as (keyof typeof DASHBOARDS)[]) {
      expect(DASHBOARDS[role].widgets).toContain("briefing");
    }
    expect(DASHBOARDS.Executive.readOnly).toBe(true);
    expect(DASHBOARDS.ProjectManager.readOnly).toBe(false);
  });
});

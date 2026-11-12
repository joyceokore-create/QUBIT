// UX plan D2/D6 — roles pick the menu; permissions hide items; empty groups vanish.
import { describe, expect, it } from "vitest";
import { activeMenuKey, canOpenItem, menuFor, ROLE_MENUS } from "@/lib/role-menus";
import { can } from "@/lib/rbac";

const viewer = (roles: string[], extra: { moduleAllowedRoles?: Record<string, string[]> } = {}) => ({
  can: (perm: string) => can({ tenantId: "t", userId: "u", roles }, perm),
  roles,
  ...extra,
});
const labels = (groups: ReturnType<typeof menuFor>) => groups.map((g) => `${g.label}: ${g.items.map((i) => i.label).join(", ")}`);

describe("menuFor", () => {
  it("groups each role's menu by job, as approved", () => {
    expect(ROLE_MENUS.Executive.map((g) => g.label)).toEqual(["Overview", "Portfolio", "Reports"]);
    expect(ROLE_MENUS.HeadOfProjects.map((g) => g.label)).toEqual(["Work", "Delivery", "Team", "Reports", "Admin"]);
    expect(ROLE_MENUS.PlatformSuperAdmin.map((g) => g.label)).toEqual(["Work", "Delivery", "Administration", "Reports"]);
  });

  it("a Head sees their whole menu with the default permissions", () => {
    expect(labels(menuFor("HeadOfProjects", viewer(["HeadOfProjects"])))).toEqual([
      "Work: Home, Approvals, My Board",
      "Delivery: Portfolios, Projects, Ideas, Risks & Issues",
      "Team: People",
      "Reports: Reports",
      "Admin: Admin, Configs",
    ]);
  });

  it("hides an item the person can't open, and drops a group left empty", () => {
    // A Super Admin-style menu viewed with Member permissions: no admin item survives.
    const asMember = menuFor("PlatformSuperAdmin", viewer(["Member"]));
    expect(asMember.some((g) => g.label === "Administration")).toBe(false);
    // …and its Reports item stays on reports:read, which a Member lacks → the group goes.
    expect(asMember.some((g) => g.label === "Reports")).toBe(false);
    // A permission-less viewer loses even the Member's Reports item (dashboard:read).
    const nobody = { can: () => false, roles: [] as string[] };
    expect(menuFor("Member", nobody)).toEqual([]);
  });

  it("UX6: a Member keeps Reports (Custom reports over their own work) without reports:read", () => {
    const member = labels(menuFor("Member", viewer(["Member"])));
    expect(member).toEqual(["Work: Home, My Board", "Delivery: Projects", "Reports: Reports"]);
    const item = ROLE_MENUS.Member.flatMap((g) => g.items).find((i) => i.href === "/reports");
    expect(item?.perm).toBe("dashboard:read");
    // Every other role's Reports item stays on reports:read.
    for (const role of ["PlatformSuperAdmin", "HeadOfProjects", "HeadOfQA", "Executive", "ProjectManager"] as const) {
      const other = ROLE_MENUS[role].flatMap((g) => g.items).find((i) => i.href === "/reports");
      expect(other?.perm).toBe("reports:read");
    }
  });

  it("menus follow REAL permissions, not the role being viewed", () => {
    // A Super Admin previewing the Executive menu still gets only Executive's items.
    const groups = menuFor("Executive", viewer(["PlatformSuperAdmin"]));
    expect(groups.flatMap((g) => g.items.map((i) => i.key))).toEqual(["home", "decisions", "portfolios", "projects", "ideas", "risks", "reports"]);
  });

  it("WS2: Decisions is the Executive's, right after Home; no other role lists it", () => {
    expect(labels(menuFor("Executive", viewer(["Executive"])))[0]).toBe("Overview: Home, Decisions");
    const item = ROLE_MENUS.Executive.flatMap((g) => g.items).find((i) => i.key === "decisions");
    expect(item?.href).toBe("/decisions");
    for (const role of ["PlatformSuperAdmin", "HeadOfProjects", "HeadOfQA", "ProjectManager", "Member"] as const) {
      expect(ROLE_MENUS[role].flatMap((g) => g.items).some((i) => i.key === "decisions"), role).toBe(false);
    }
  });

  it("respects module allowedRoles from the registry", () => {
    const groups = menuFor("HeadOfProjects", viewer(["HeadOfProjects"], { moduleAllowedRoles: { IDEAS: ["Executive"] } }));
    expect(groups.flatMap((g) => g.items.map((i) => i.key))).not.toContain("ideas");
  });
});

describe("UX8 Approvals and anyPerm", () => {
  it("anyPerm opens the item when the viewer holds ANY of the listed permissions", () => {
    const item = { anyPerm: ["idea:triage", "staffing:manage"] };
    expect(canOpenItem(item, { can: (p) => p === "idea:triage" })).toBe(true);
    expect(canOpenItem(item, { can: (p) => p === "staffing:manage" })).toBe(true);
    expect(canOpenItem(item, { can: () => false })).toBe(false);
    // An empty list opens to no one; a single perm still works as before.
    expect(canOpenItem({ anyPerm: [] }, { can: () => true })).toBe(false);
    expect(canOpenItem({ perm: "x:y" }, { can: (p) => p === "x:y" })).toBe(true);
  });

  it("the Head gets Approvals right after Home; Super Admin (design), Executive and Member don't", () => {
    expect(labels(menuFor("PlatformSuperAdmin", viewer(["PlatformSuperAdmin"])))[0]).toBe("Work: Home, Access Requests");
    for (const role of ["Executive", "Member"] as const) {
      expect(ROLE_MENUS[role].flatMap((g) => g.items).some((i) => i.key === "approvals"), role).toBe(false);
    }
  });

  it("WS1: a PM (own gate submissions) and Head of QA (testing gates) get Approvals after Home", () => {
    expect(labels(menuFor("ProjectManager", viewer(["ProjectManager"])))[0]).toBe("Work: Home, Approvals, My Board");
    expect(labels(menuFor("HeadOfQA", viewer(["HeadOfQA"])))[0]).toBe("Work: Home, Approvals, My Board");
    for (const role of ["ProjectManager", "HeadOfQA"] as const) {
      const item = ROLE_MENUS[role].flatMap((g) => g.items).find((i) => i.key === "approvals");
      expect(item?.href, role).toBe("/approvals");
      // Opens on a permission every PM / Head of QA holds; the page itself decides by role.
      expect(item?.perm, role).toBe("project:read");
    }
  });

  it("Approvals is hidden from a Head-menu viewer without idea:triage or staffing:manage, shown with either", () => {
    const keys = (perms: string[]) =>
      menuFor("HeadOfProjects", { can: (p) => perms.includes(p), roles: ["HeadOfProjects"] }).flatMap((g) => g.items.map((i) => i.key));
    expect(keys(["dashboard:read"])).not.toContain("approvals");
    expect(keys(["dashboard:read", "idea:triage"])).toContain("approvals");
    expect(keys(["dashboard:read", "staffing:manage"])).toContain("approvals");
    // A Head-of-QA or PM holds neither, so a Super Admin previewing the Head menu with PM rights loses it.
    expect(menuFor("HeadOfProjects", viewer(["ProjectManager"])).flatMap((g) => g.items.map((i) => i.key))).not.toContain("approvals");
  });
});

describe("activeMenuKey", () => {
  it("lights exactly one item: the longest matching href", () => {
    const groups = menuFor("PlatformSuperAdmin", viewer(["PlatformSuperAdmin"]));
    expect(activeMenuKey("/admin/users/123", groups)).toBe("users");
    expect(activeMenuKey("/projects/abc", groups)).toBe("projects");
    expect(activeMenuKey("/nowhere", groups)).toBeNull();
  });
});

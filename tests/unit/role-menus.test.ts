// UX plan D2/D6 — roles pick the menu; permissions hide items; empty groups vanish.
import { describe, expect, it } from "vitest";
import { activeMenuKey, menuFor, ROLE_MENUS } from "@/lib/role-menus";
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
      "Work: Home, My Board",
      "Delivery: Portfolios, Projects, Ideas, Risks & Issues",
      "Team: People",
      "Reports: Reports",
      "Admin: Admin, Configs",
    ]);
  });

  it("hides an item the person can't open, and drops a group left empty", () => {
    // A Member viewing… their own menu: no reports:read by default → the Reports group goes.
    const member = labels(menuFor("Member", viewer(["Member"])));
    expect(member).toEqual(["Work: Home, My Board", "Delivery: Projects"]);
    // A Super Admin-style menu viewed with Member permissions: no admin item survives.
    const asMember = menuFor("PlatformSuperAdmin", viewer(["Member"]));
    expect(asMember.some((g) => g.label === "Administration")).toBe(false);
  });

  it("menus follow REAL permissions, not the role being viewed", () => {
    // A Super Admin previewing the Executive menu still gets only Executive's items.
    const groups = menuFor("Executive", viewer(["PlatformSuperAdmin"]));
    expect(groups.flatMap((g) => g.items.map((i) => i.key))).toEqual(["home", "portfolios", "projects", "ideas", "risks", "reports"]);
  });

  it("respects module allowedRoles from the registry", () => {
    const groups = menuFor("HeadOfProjects", viewer(["HeadOfProjects"], { moduleAllowedRoles: { IDEAS: ["Executive"] } }));
    expect(groups.flatMap((g) => g.items.map((i) => i.key))).not.toContain("ideas");
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

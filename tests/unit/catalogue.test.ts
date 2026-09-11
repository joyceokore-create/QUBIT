import { describe, expect, it } from "vitest";
import { APP_MODULES, CATALOGUE_PERMISSIONS, CATALOGUE_PERMISSION_CODES } from "@/lib/catalogue";
import { PERMISSION_CATALOGUE } from "@/lib/rbac";
import { groupPermissions } from "@/lib/permission-groups";

describe("RBAC catalogue (code source of truth)", () => {
  it("every permission has a unique code and a real module", () => {
    const moduleCodes = new Set(APP_MODULES.map((m) => m.code));
    const seen = new Set<string>();
    for (const p of CATALOGUE_PERMISSIONS) {
      expect(seen.has(p.code), `duplicate code ${p.code}`).toBe(false);
      seen.add(p.code);
      expect(moduleCodes.has(p.module), `${p.code} → unknown module ${p.module}`).toBe(true);
    }
  });

  it("module allowedRoles reference canonical role names only", () => {
    const canonical = new Set([
      "PlatformSuperAdmin", "HeadOfProjects", "HeadOfQA", "Executive", "ProjectManager", "Member",
    ]);
    for (const m of APP_MODULES) {
      for (const r of m.allowedRoles) expect(canonical.has(r), `${m.code} → bad role ${r}`).toBe(true);
    }
  });

  it("rbac.PERMISSION_CATALOGUE equals the derived code list (no drift)", () => {
    expect([...PERMISSION_CATALOGUE].sort()).toEqual([...CATALOGUE_PERMISSION_CODES].sort());
  });

  it("groupPermissions partitions the full catalogue with no empty groups", () => {
    const groups = groupPermissions(CATALOGUE_PERMISSION_CODES);
    const all = groups.flatMap((g) => g.permissions);
    expect(all.sort()).toEqual([...CATALOGUE_PERMISSION_CODES].sort());
    for (const g of groups) expect(g.permissions.length).toBeGreaterThan(0);
  });

  it("routes an unknown-module permission into Other", () => {
    const groups = groupPermissions(["nonexistent:action"]);
    expect(groups.find((g) => g.label === "Other")?.permissions).toEqual(["nonexistent:action"]);
  });
});

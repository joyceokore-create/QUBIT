import { describe, expect, it } from "vitest";
import { PERMISSION_CATALOGUE } from "@/lib/rbac";
import { groupPermissions } from "@/lib/permission-groups";

describe("permission grouping (roles admin picker)", () => {
  it("places every catalogue entry in exactly one group", () => {
    const groups = groupPermissions(PERMISSION_CATALOGUE);
    const all = groups.flatMap((g) => g.permissions);
    expect(all.sort()).toEqual([...PERMISSION_CATALOGUE].sort());
    expect(new Set(all).size).toBe(all.length);
  });

  it("routes unknown future permissions into Other instead of dropping them", () => {
    const groups = groupPermissions(["totally:new-thing"]);
    expect(groups.find((g) => g.label === "Other")?.permissions).toEqual(["totally:new-thing"]);
  });

  it("emits no empty groups", () => {
    for (const g of groupPermissions(PERMISSION_CATALOGUE)) {
      expect(g.permissions.length).toBeGreaterThan(0);
    }
  });
});

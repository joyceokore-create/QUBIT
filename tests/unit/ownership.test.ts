// docs/38 — who runs a project: lead, "Project Manager" members, and (pmScope = instance)
// the leads of its live instances; which org-unit kinds an instance label allows.
import { describe, expect, it } from "vitest";
import { pmIdsOf, runsProjectWhere } from "@/lib/ownership";
import { marketKinds } from "@/server/markets";

describe("ownership", () => {
  it("pmIdsOf de-duplicates and only counts instance leads under pmScope = instance", () => {
    const base = { leadUserId: "u1", members: [{ userId: "u2" }, { userId: "u1" }], orgStatuses: [{ leadUserId: "u3" }, { leadUserId: null }] };
    expect(pmIdsOf({ ...base, pmScope: "product" })).toEqual(["u1", "u2"]);
    expect(pmIdsOf({ ...base, pmScope: "instance" })).toEqual(["u1", "u2", "u3"]);
    expect(pmIdsOf({ leadUserId: null, pmScope: "instance", members: [], orgStatuses: [] })).toEqual([]);
  });
  it("runsProjectWhere names the three ways in", () => {
    const w = runsProjectWhere("u9");
    expect(w.OR).toHaveLength(3);
    expect(w.OR?.[2]).toMatchObject({ pmScope: "instance", orgStatuses: { some: { leadUserId: "u9", retiredAt: null } } });
  });
  it("marketKinds follows the label", () => {
    expect(marketKinds("Market")).toEqual(["Market", "Internal"]); // markets = subsidiaries
    expect(marketKinds("Subsidiary")).toEqual(["Internal"]);
    expect(marketKinds("Instance")).toEqual(["Market", "Internal"]);
  });
});

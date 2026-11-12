import { describe, expect, it } from "vitest";
import { RETENTION_DEFAULT_DAYS, retentionCutoff, retentionDays } from "@/lib/retention";
import { DECLINE_REASON_VALUES } from "@/lib/access-request-schema";
import { auditChange } from "@/lib/audit-view";

// UX fidelity D-F3b — access-request retention.
describe("retention", () => {
  it("falls back to 30 days for unset, junk or out-of-range values", () => {
    expect(RETENTION_DEFAULT_DAYS).toBe(30);
    for (const v of [undefined, null, "45", 6, 366, 12.5, Number.NaN]) expect(retentionDays(v)).toBe(30);
    expect(retentionDays(7)).toBe(7);
    expect(retentionDays(365)).toBe(365);
  });

  it("cuts off exactly N days before now", () => {
    const now = new Date("2026-11-11T00:00:00Z");
    expect(retentionCutoff(now, 30).toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("decline reasons are fixed codes, shown in plain words in the audit log", () => {
    expect(DECLINE_REASON_VALUES).toEqual(["not_employee", "duplicate", "wrong_role", "other"]);
    expect(auditChange("access_request_review", { status: "NEW" }, { status: "DISMISSED", reasonCode: "duplicate" })).toBe(
      "Status: NEW → DISMISSED; Reason: — → Duplicate request",
    );
    expect(auditChange("update", { accessRequestRetentionDays: 30 }, { accessRequestRetentionDays: 14 })).toBe("Keep decided requests (days): 30 → 14");
  });
});

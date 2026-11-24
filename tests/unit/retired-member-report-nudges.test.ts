import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { collectMemberReportChase, NUDGE_SIGNALS, RETIRED_MEMBER_REPORTS } from "@/server/nudger";

// UX12 — member weekly reports are retired, so their nudges ("your report is still a draft",
// "acknowledge this member report") must not be emitted. The signal names stay so nudges
// already stored still render.
describe("retired member-report nudges", () => {
  it("are switched off but still known as signal names", () => {
    expect(RETIRED_MEMBER_REPORTS).toBe(true);
    expect(NUDGE_SIGNALS).toContain("member_report_unsent");
    expect(NUDGE_SIGNALS).toContain("member_report_unacknowledged");
  });

  it("the draft chase emits nothing and never queries", async () => {
    const tx = new Proxy({}, { get: () => { throw new Error("must not query"); } }) as unknown as Prisma.TransactionClient;
    await expect(collectMemberReportChase(tx, new Date())).resolves.toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { matchesSubmitted, workloadBucket } from "@/lib/list-buckets";

const NOW = new Date("2026-11-10T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("matchesSubmitted", () => {
  it("matches everything when no filter is set", () => {
    expect(matchesSubmitted("", daysAgo(400), NOW)).toBe(true);
  });

  it("'week' is the last 7 days, inclusive", () => {
    expect(matchesSubmitted("week", daysAgo(0), NOW)).toBe(true);
    expect(matchesSubmitted("week", daysAgo(7), NOW)).toBe(true);
    expect(matchesSubmitted("week", daysAgo(7.01), NOW)).toBe(false);
  });

  it("'month' is the last 30 days and includes this week", () => {
    expect(matchesSubmitted("month", daysAgo(3), NOW)).toBe(true);
    expect(matchesSubmitted("month", daysAgo(30), NOW)).toBe(true);
    expect(matchesSubmitted("month", daysAgo(31), NOW)).toBe(false);
  });

  it("'older' is everything before the last 30 days", () => {
    expect(matchesSubmitted("older", daysAgo(30), NOW)).toBe(false);
    expect(matchesSubmitted("older", daysAgo(31), NOW)).toBe(true);
  });

  it("accepts ISO strings and treats a future date as just submitted", () => {
    expect(matchesSubmitted("week", daysAgo(2).toISOString(), NOW)).toBe(true);
    expect(matchesSubmitted("week", new Date(NOW.getTime() + 60_000), NOW)).toBe(true);
    expect(matchesSubmitted("older", new Date(NOW.getTime() + 60_000), NOW)).toBe(false);
  });

  it("rejects an unparseable date and ignores an unknown filter", () => {
    expect(matchesSubmitted("week", "not a date", NOW)).toBe(false);
    expect(matchesSubmitted("someday", daysAgo(3), NOW)).toBe(true);
  });
});

describe("workloadBucket", () => {
  it("splits at 50% and 100%, with both ends of the middle band included", () => {
    expect(workloadBucket(0)).toBe("under");
    expect(workloadBucket(49)).toBe("under");
    expect(workloadBucket(50)).toBe("full");
    expect(workloadBucket(100)).toBe("full");
    expect(workloadBucket(101)).toBe("over");
    expect(workloadBucket(250)).toBe("over");
  });
});

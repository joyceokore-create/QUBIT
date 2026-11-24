// UX5 (L4) — pure helpers behind the server-paged lists: LIKE escaping and tenant-local
// date-range boundaries.
import { describe, expect, it } from "vitest";
import { containsText, dayRange, escapeLike, formatDayKey, isDayKey, startOfDayInZone } from "@/lib/list-query";

describe("escapeLike", () => {
  it("escapes the LIKE wildcards and the escape character itself", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(escapeLike("plain text")).toBe("plain text");
  });

  it("containsText builds a case-insensitive, escaped Prisma filter", () => {
    expect(containsText("a_b")).toEqual({ contains: "a\\_b", mode: "insensitive" });
  });
});

describe("isDayKey", () => {
  it("accepts real calendar days only", () => {
    expect(isDayKey("2026-11-09")).toBe(true);
    expect(isDayKey("2028-02-29")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "2026-1-9", "09/11/2026", "", null, undefined, "2026-11-09T00:00", "1969-12-31"]) {
      expect(isDayKey(bad)).toBe(false);
    }
  });
});

describe("startOfDayInZone", () => {
  it("reads a day as the tenant's local day (Nairobi is UTC+3, no DST)", () => {
    expect(startOfDayInZone("2026-11-09", "Africa/Nairobi").toISOString()).toBe("2026-11-08T21:00:00.000Z");
  });

  it("is midnight UTC for UTC", () => {
    expect(startOfDayInZone("2026-11-09", "UTC").toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  it("handles DST zones on the change-over day", () => {
    // New York springs forward at 02:00 on 8 Mar 2026; midnight is still EST (UTC-5).
    expect(startOfDayInZone("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    // …and the day after is EDT (UTC-4).
    expect(startOfDayInZone("2026-03-09", "America/New_York").toISOString()).toBe("2026-03-09T04:00:00.000Z");
    // London moves to BST at 01:00 on 29 Mar 2026; midnight is still GMT.
    expect(startOfDayInZone("2026-03-29", "Europe/London").toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(startOfDayInZone("2026-03-30", "Europe/London").toISOString()).toBe("2026-03-29T23:00:00.000Z");
  });
});

describe("dayRange", () => {
  it("covers whole tenant-local days, both ends inclusive", () => {
    const r = dayRange("2026-11-09", "2026-11-10", "Africa/Nairobi");
    expect(r.gte?.toISOString()).toBe("2026-11-08T21:00:00.000Z");
    // exclusive bound = start of 11 Nov in Nairobi
    expect(r.lt?.toISOString()).toBe("2026-11-10T21:00:00.000Z");
    expect(r.from).toBe("2026-11-09");
    expect(r.to).toBe("2026-11-10");
  });

  it("rolls over month and year ends", () => {
    expect(dayRange(null, "2026-12-31", "UTC").lt?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("swaps a backwards range and drops invalid days", () => {
    const swapped = dayRange("2026-11-10", "2026-11-09", "UTC");
    expect(swapped.from).toBe("2026-11-09");
    expect(swapped.to).toBe("2026-11-10");
    expect(dayRange("nonsense", "2026-02-30", "UTC")).toEqual({});
    const onlyFrom = dayRange("2026-11-09", "bad", "UTC");
    expect(onlyFrom.gte?.toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(onlyFrom.lt).toBeUndefined();
  });
});

describe("formatDayKey", () => {
  it("formats a day key without shifting it through a zone", () => {
    expect(formatDayKey("2026-11-09")).toBe("9 Nov 2026");
    expect(formatDayKey("2026-01-01")).toBe("1 Jan 2026");
  });
});

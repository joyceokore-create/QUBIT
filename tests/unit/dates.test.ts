// UX plan U5/Q3 — one date format, in the tenant's time zone (Africa/Nairobi by default).
import { describe, expect, it } from "vitest";
import { DEFAULT_TIME_ZONE, dayKey, formatDate, formatDateTime, formatDayMonth, formatTime, isOverdue, isSameDay, isValidTimeZone } from "@/lib/dates";

// 21:30 UTC on Sun 8 Nov is 00:30 on Mon 9 Nov in Nairobi (UTC+3).
const LATE_SUNDAY_UTC = new Date("2026-11-08T21:30:00.000Z");

describe("date formats", () => {
  it("formats the agreed shapes", () => {
    const d = new Date("2026-11-13T14:00:00.000Z"); // 17:00 Nairobi
    expect(formatDate(d)).toBe("13 Nov 2026");
    expect(formatDayMonth(d)).toBe("13 Nov");
    expect(formatTime(d)).toBe("17:00");
    expect(formatDateTime(d)).toBe("Fri 13 Nov, 17:00");
  });

  it("defaults to Africa/Nairobi, not the server's or browser's clock", () => {
    expect(DEFAULT_TIME_ZONE).toBe("Africa/Nairobi");
    expect(formatDate(LATE_SUNDAY_UTC)).toBe("9 Nov 2026");
    expect(formatDate(LATE_SUNDAY_UTC, "UTC")).toBe("8 Nov 2026");
  });

  it("falls back to the default for an unknown zone instead of throwing", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(formatDate(LATE_SUNDAY_UTC, "Mars/Olympus")).toBe("9 Nov 2026");
  });
});

describe("today and overdue follow the tenant's calendar day", () => {
  it("keys the instant to the tenant-local day", () => {
    expect(dayKey(LATE_SUNDAY_UTC)).toBe("2026-11-09");
    expect(dayKey(LATE_SUNDAY_UTC, "UTC")).toBe("2026-11-08");
  });

  it("due today is not overdue; due yesterday is", () => {
    const now = new Date("2026-11-09T06:00:00.000Z"); // 09:00 Mon in Nairobi
    expect(isSameDay(LATE_SUNDAY_UTC, now)).toBe(true);
    expect(isOverdue(LATE_SUNDAY_UTC, now)).toBe(false);
    expect(isOverdue(new Date("2026-11-08T12:00:00.000Z"), now)).toBe(true);
  });
});

describe("September abbreviation (UX5)", () => {
  it("prints Sep, not Sept, whatever the ICU data", () => {
    expect(formatDate(new Date("2026-09-14T09:00:00Z"), "Africa/Nairobi")).toBe("14 Sep 2026");
    expect(formatDayMonth(new Date("2026-09-14T09:00:00Z"), "Africa/Nairobi")).toBe("14 Sep");
  });
});

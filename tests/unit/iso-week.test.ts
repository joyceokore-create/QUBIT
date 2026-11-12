import { describe, expect, it } from "vitest";
import { isoWeekId, weekWindow } from "@/lib/iso-week";

describe("isoWeekId", () => {
  it("computes plain mid-year weeks", () => {
    expect(isoWeekId(new Date(Date.UTC(2026, 6, 28)))).toBe("2026-W31"); // Tue 28 Jul 2026
    expect(isoWeekId(new Date(Date.UTC(2026, 6, 31)))).toBe("2026-W31"); // Fri 31 Jul 2026
  });

  it("assigns early January to the previous ISO year when week 1 hasn't started", () => {
    // 1 Jan 2027 is a Friday → belongs to 2026-W53.
    expect(isoWeekId(new Date(Date.UTC(2027, 0, 1)))).toBe("2026-W53");
    // 4 Jan 2027 is the first Monday → 2027-W01.
    expect(isoWeekId(new Date(Date.UTC(2027, 0, 4)))).toBe("2027-W01");
  });

  it("assigns late December to the next ISO year when it falls in week 1", () => {
    // 29 Dec 2025 (Mon) belongs to 2026-W01.
    expect(isoWeekId(new Date(Date.UTC(2025, 11, 29)))).toBe("2026-W01");
  });
});

describe("weekWindow", () => {
  it("spans Monday 00:00 UTC to next Monday, containing the date", () => {
    const w = weekWindow(new Date(Date.UTC(2026, 6, 28, 15, 30))); // Tue
    expect(w.start.toISOString()).toBe("2026-07-27T00:00:00.000Z"); // Mon
    expect(w.end.toISOString()).toBe("2026-08-03T00:00:00.000Z");
    expect(w.isoWeek).toBe("2026-W31");
  });

  it("keeps a Sunday inside the week that started the previous Monday", () => {
    const w = weekWindow(new Date(Date.UTC(2026, 7, 2))); // Sun 2 Aug
    expect(w.start.toISOString()).toBe("2026-07-27T00:00:00.000Z");
    expect(w.isoWeek).toBe("2026-W31");
  });
});

// Milestone B — week-id arithmetic for the /reports week switcher.
import { isValidIsoWeek, isoWeekMonday, shiftIsoWeek } from "@/lib/iso-week";

describe("isoWeekMonday", () => {
  it("finds the UTC Monday of a week id, across year boundaries", () => {
    expect(isoWeekMonday("2026-W41").toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(isoWeekMonday("2027-W01").toISOString()).toBe("2027-01-04T00:00:00.000Z");
    expect(isoWeekMonday("2026-W01").toISOString()).toBe("2025-12-29T00:00:00.000Z");
    expect(isoWeekMonday("2026-W53").toISOString()).toBe("2026-12-28T00:00:00.000Z");
  });

  it("round-trips through isoWeekId and weekWindow", () => {
    for (const id of ["2026-W01", "2026-W31", "2026-W53", "2027-W01", "2028-W17"]) {
      expect(isoWeekId(isoWeekMonday(id))).toBe(id);
      expect(weekWindow(isoWeekMonday(id)).start.getTime()).toBe(isoWeekMonday(id).getTime());
    }
  });

  it("throws on an id that is not a real week", () => {
    expect(() => isoWeekMonday("nope")).toThrow(RangeError);
    expect(() => isoWeekMonday("2027-W53")).toThrow(RangeError); // 2027 has 52 weeks
  });
});

describe("shiftIsoWeek", () => {
  it("steps across year boundaries, including 53-week years", () => {
    expect(shiftIsoWeek("2027-W01", -1)).toBe("2026-W53");
    expect(shiftIsoWeek("2026-W53", 1)).toBe("2027-W01");
    expect(shiftIsoWeek("2026-W41", -8)).toBe("2026-W33");
    expect(shiftIsoWeek("2026-W01", -1)).toBe("2025-W52");
  });
});

describe("isValidIsoWeek", () => {
  it("accepts real weeks and rejects the rest", () => {
    for (const ok of ["2026-W01", "2026-W53", "2026-W41"]) expect(isValidIsoWeek(ok)).toBe(true);
    for (const bad of ["2027-W53", "2026-W00", "2026-W54", "2026-41", "26-W41", "", "2026-W4"]) expect(isValidIsoWeek(bad)).toBe(false);
  });
});

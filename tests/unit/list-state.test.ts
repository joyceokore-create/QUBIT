import { describe, expect, it } from "vitest";
import { matchesSearch, pageInfo, pageWindow, paginate, parseListParams, parsePage, parseSearch, parseSize } from "@/lib/list-state";

// UX5 — the list contract (UX plan L1–L4).

describe("URL parsing", () => {
  it("accepts only the five page sizes, else the table default", () => {
    expect(parseSize("25", 10)).toBe(25);
    expect(parseSize("5", 10)).toBe(5);
    expect(parseSize("7", 10)).toBe(10);
    expect(parseSize("1000", 10)).toBe(10);
    expect(parseSize(null, 5)).toBe(5);
  });

  it("reads odd pages as page 1 and trims and caps search", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("1.5")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parseSearch("  pay  ")).toBe("pay");
    expect(parseSearch("x".repeat(500))).toHaveLength(100);
  });

  it("allow-lists server filters so nothing unvalidated reaches a query", () => {
    const p = parseListParams(
      { q: " hub ", page: "2", size: "50", severity: "Critical", status: "DROP TABLE", owner: "abc-123", note: "free text", junk: "x" },
      { defaultSize: 10, filters: { severity: ["Low", "Medium", "Critical"], status: ["Open", "Closed"], owner: "id", note: "text" } },
    );
    expect(p).toEqual({ q: "hub", page: 2, size: 50, filters: { severity: "Critical", owner: "abc-123", note: "free text" } });
    const bad = parseListParams({ owner: "x'; --", size: "500", page: ["4", "9"] }, { defaultSize: 5, filters: { owner: "id" } });
    expect(bad).toEqual({ q: "", page: 4, size: 5, filters: {} });
  });
});

describe("paging", () => {
  it("describes a page with 1-based from/to", () => {
    expect(pageInfo(48, 1, 10)).toMatchObject({ page: 1, pageCount: 5, from: 1, to: 10, skip: 0 });
    expect(pageInfo(48, 5, 10)).toMatchObject({ page: 5, from: 41, to: 48, skip: 40 });
  });

  it("clamps an out-of-range page and handles empty lists", () => {
    expect(pageInfo(12, 9, 10)).toMatchObject({ page: 2, from: 11, to: 12 });
    expect(pageInfo(0, 3, 10)).toMatchObject({ page: 1, pageCount: 1, from: 0, to: 0 });
  });

  it("slices in the browser", () => {
    const rows = Array.from({ length: 23 }, (_, i) => i + 1);
    const { rows: page3, info } = paginate(rows, 3, 10);
    expect(page3).toEqual([21, 22, 23]);
    expect(info.total).toBe(23);
  });

  it("shows every page when there are few, and a window with gaps otherwise", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, "gap", 20]);
    expect(pageWindow(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "gap", 17, 18, 19, 20]);
  });
});

describe("search", () => {
  it("matches any field, case-insensitively, and empty search matches all", () => {
    expect(matchesSearch("pay", "Payments Hub", null)).toBe(true);
    expect(matchesSearch("RBS-0", "Hub", "rbs-05")).toBe(true);
    expect(matchesSearch("zzz", "Hub", undefined)).toBe(false);
    expect(matchesSearch("", "anything")).toBe(true);
  });
});

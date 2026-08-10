import { describe, expect, it } from "vitest";
import { businessDaysBetween } from "@/lib/board-lens";
import { mergeNudgesIntoPriorities } from "@/server/dashboard-exec";
import type { MyNudge } from "@/server/nudger";
import type { BriefingItem } from "@/server/relevance";

describe("businessDaysBetween", () => {
  const d = (s: string) => new Date(`${s}T12:00:00Z`);

  it("counts only Mon–Fri", () => {
    // Tue 21 Jul → Tue 28 Jul 2026 spans one weekend.
    expect(businessDaysBetween(d("2026-07-21"), d("2026-07-28"))).toBe(5);
  });

  it("skips a whole weekend", () => {
    // Fri 24 Jul → Mon 27 Jul: only Monday counts.
    expect(businessDaysBetween(d("2026-07-24"), d("2026-07-27"))).toBe(1);
  });

  it("returns 0 for same-day and inverted ranges", () => {
    expect(businessDaysBetween(d("2026-07-28"), d("2026-07-28"))).toBe(0);
    expect(businessDaysBetween(d("2026-07-29"), d("2026-07-28"))).toBe(0);
  });
});

const nudge = (id: string, entityId: string, level = 0): MyNudge => ({
  id,
  signal: "task_due",
  message: `nudge ${id}`,
  link: "/x",
  escalationLevel: level,
  projectId: null,
  entityId,
});
const brief = (id: string): BriefingItem => ({ id, kind: "task", title: `brief ${id}`, meta: "", severity: "info", href: "/y" });

describe("mergeNudgesIntoPriorities", () => {
  it("puts nudges first and keeps relevance items after", () => {
    const merged = mergeNudgesIntoPriorities([nudge("n1", "e1")], [brief("b1"), brief("b2")]);
    expect(merged.map((m) => m.kind)).toEqual(["nudge", "task", "task"]);
  });

  it("drops relevance items the nudger already covers (same entity)", () => {
    const merged = mergeNudgesIntoPriorities([nudge("n1", "shared")], [brief("shared"), brief("b2")]);
    expect(merged).toHaveLength(2);
    expect(merged.filter((m) => m.id === "shared")).toHaveLength(1);
    expect(merged[0].kind).toBe("nudge");
  });

  it("caps at the limit and marks escalated nudges red", () => {
    const merged = mergeNudgesIntoPriorities(
      [nudge("n1", "e1", 1), nudge("n2", "e2")],
      [brief("b1"), brief("b2"), brief("b3"), brief("b4")],
    );
    expect(merged).toHaveLength(5);
    expect(merged[0].severity).toBe("red");
    expect(merged[0].meta).toBe("NUDGE · ESCALATED");
    expect(merged[1].severity).toBe("amber");
  });
});

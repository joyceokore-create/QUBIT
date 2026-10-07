import { describe, expect, it } from "vitest";
import { canPreview, ownView, reportsHref, resolveReportsView, resolveTab } from "@/lib/reports-view";

describe("reports view resolution", () => {
  it("maps roles to views — Head beats Executive, QA head reads as an executive, others are PMs", () => {
    expect(ownView(["HeadOfProjects", "Executive"])).toBe("head");
    expect(ownView(["PlatformSuperAdmin"])).toBe("head");
    expect(ownView(["Executive"])).toBe("exec");
    expect(ownView(["HeadOfQA"])).toBe("exec");
    expect(ownView(["ProjectManager"])).toBe("pm");
    expect(ownView(["Member"])).toBe("pm");
  });

  it("only Heads may preview another view; others always get their own", () => {
    expect(canPreview(["HeadOfProjects"])).toBe(true);
    expect(canPreview(["Executive"])).toBe(false);
    expect(resolveReportsView(["HeadOfProjects"], "exec")).toBe("exec");
    expect(resolveReportsView(["HeadOfProjects"], "nonsense")).toBe("head");
    expect(resolveReportsView(["ProjectManager"], "head")).toBe("pm");
  });

  it("keeps old tab links landing somewhere sensible", () => {
    expect(resolveTab("pm", "custom")).toBe("custom");
    expect(resolveTab("pm", "mine")).toBe("week");
    expect(resolveTab("head", "team")).toBe("week");
    expect(resolveTab("head", "rollups")).toBe("rollups");
    expect(resolveTab("exec", "rollups")).toBe("past");
    expect(resolveTab("pm", "rollups")).toBe("week");
    expect(resolveTab("exec", "checkins")).toBe("week");
    expect(resolveTab("exec", undefined)).toBe("week");
  });

  it("builds canonical hrefs, omitting defaults", () => {
    const d = { week: "2026-W41", view: "head" as const };
    expect(reportsHref({}, d)).toBe("/reports");
    expect(reportsHref({ week: "2026-W41", tab: "week" }, d)).toBe("/reports");
    expect(reportsHref({ week: "2026-W40" }, d)).toBe("/reports?week=2026-W40");
    expect(reportsHref({ as: "pm", tab: "custom" }, d)).toBe("/reports?as=pm&tab=custom");
    expect(reportsHref({ as: "head" }, d)).toBe("/reports");
  });
});

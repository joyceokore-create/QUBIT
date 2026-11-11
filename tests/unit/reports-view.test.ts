import { describe, expect, it } from "vitest";
import { canPreview, canReadQualityReport, CUSTOM_ONLY_TABS, customReportsOnly, ownView, reportsHref, resolveReportsView, resolveTab, showsQualityTab, TABS, tabsFor } from "@/lib/reports-view";

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

describe("UX6 — Custom reports only", () => {
  const ctx = (roles: string[], permissions?: string[]) => ({ tenantId: "t", userId: "u", roles, permissions });

  it("applies to viewers without reports:read (a Member by default), never to report readers", () => {
    expect(customReportsOnly(ctx(["Member"]))).toBe(true);
    for (const r of ["ProjectManager", "HeadOfProjects", "HeadOfQA", "Executive", "PlatformSuperAdmin"]) {
      expect(customReportsOnly(ctx([r]))).toBe(false);
    }
  });

  it("follows effective permissions, so a tenant override can grant a Member the full page", () => {
    expect(customReportsOnly(ctx(["Member"], ["dashboard:read", "reports:read"]))).toBe(false);
    expect(customReportsOnly(ctx(["ProjectManager"], ["dashboard:read"]))).toBe(true);
  });

  it("has exactly one tab: Custom reports", () => {
    expect(CUSTOM_ONLY_TABS).toEqual([{ key: "custom", label: "Custom Reports" }]);
  });
});

describe("UX9 — Reports › Quality (Head of QA)", () => {
  const ctx = (roles: string[], permissions?: string[]) => ({ tenantId: "t", userId: "u", roles, permissions });
  const classic = { uiMode: "classic", viewRole: "Executive" };

  it("adds Quality to the Executive view only when offered, between Past weeks and Custom reports", () => {
    expect(tabsFor("exec", { quality: true }).map((t) => t.key)).toEqual(["week", "past", "quality", "custom"]);
    expect(tabsFor("exec", { quality: false })).toEqual(TABS.exec);
    expect(tabsFor("exec")).toEqual(TABS.exec);
    // Quality lives in the Executive view only — other views never grow it.
    expect(tabsFor("head", { quality: true })).toEqual(TABS.head);
    expect(tabsFor("pm", { quality: true })).toEqual(TABS.pm);
  });

  it("resolveTab accepts ?tab=quality only where the tab is offered; everyone else lands on This week", () => {
    expect(resolveTab("exec", "quality", { quality: true })).toBe("quality");
    expect(resolveTab("exec", "quality", { quality: false })).toBe("week");
    expect(resolveTab("exec", "quality")).toBe("week");
    expect(resolveTab("head", "quality", { quality: true })).toBe("week");
    expect(resolveTab("pm", "quality")).toBe("week");
    // Offering Quality changes nothing else.
    expect(resolveTab("exec", "rollups", { quality: true })).toBe("past");
    expect(resolveTab("exec", "custom", { quality: true })).toBe("custom");
  });

  it("only a Head of QA with reports:read may read the Quality report", () => {
    expect(canReadQualityReport(ctx(["HeadOfQA"]))).toBe(true);
    for (const r of ["Executive", "HeadOfProjects", "ProjectManager", "Member", "PlatformSuperAdmin"]) {
      expect(canReadQualityReport(ctx([r]))).toBe(false);
    }
    // A tenant override that removes reports:read removes the report too.
    expect(canReadQualityReport(ctx(["HeadOfQA"], ["dashboard:read"]))).toBe(false);
  });

  it("shows the tab to Head of QA in the classic layout, and in the new layout only while viewing as Head of QA", () => {
    expect(showsQualityTab(ctx(["HeadOfQA"]), classic)).toBe(true);
    expect(showsQualityTab(ctx(["HeadOfQA"]), { uiMode: "new", viewRole: "HeadOfQA" })).toBe(true);
    expect(showsQualityTab(ctx(["HeadOfQA", "Executive"]), { uiMode: "new", viewRole: "Executive" })).toBe(false);
    // Executive and others never get it; a Super Admin previewing Head of QA doesn't either.
    expect(showsQualityTab(ctx(["Executive"]), classic)).toBe(false);
    expect(showsQualityTab(ctx(["Executive"]), { uiMode: "new", viewRole: "Executive" })).toBe(false);
    expect(showsQualityTab(ctx(["PlatformSuperAdmin"]), { uiMode: "new", viewRole: "HeadOfQA" })).toBe(false);
  });
});

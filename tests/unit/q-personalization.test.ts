import { describe, expect, it } from "vitest";
import { defaultReportType } from "@/server/q/report";
import { qSuggestionChips } from "@/lib/q-chips";

const ROLES = ["Member", "ProjectManager", "Executive", "HeadOfProjects", "HeadOfQA", "PlatformSuperAdmin"];

describe("Q personalization (§7)", () => {
  it("defaultReportType resolves the viewer's role-default report", () => {
    expect(defaultReportType(["Member"])).toBe("member");
    expect(defaultReportType(["ProjectManager"])).toBe("manager");
    expect(defaultReportType(["ProjectManager", "Member"])).toBe("manager");
    expect(defaultReportType(["Executive"])).toBe("portfolio");
    expect(defaultReportType(["HeadOfQA"])).toBe("portfolio");
    expect(defaultReportType(["HeadOfProjects"])).toBe("portfolio");
    expect(defaultReportType(["PlatformSuperAdmin"])).toBe("portfolio");
    expect(defaultReportType([])).toBe("member");
  });

  it("qSuggestionChips gives role-appropriate prompts (highest role wins for multi-role)", () => {
    expect(qSuggestionChips(["Member"]).some((c) => /week|tasks/i.test(c.label))).toBe(true);
    expect(qSuggestionChips(["ProjectManager"]).some((c) => /my projects/i.test(c.label))).toBe(true);
    expect(qSuggestionChips(["HeadOfQA"]).some((c) => /testing/i.test(c.label))).toBe(true);
    expect(qSuggestionChips(["PlatformSuperAdmin"]).some((c) => /platform/i.test(c.label))).toBe(true);
    // Multi-role: the highest-priority role's chips win.
    expect(qSuggestionChips(["Member", "PlatformSuperAdmin"]).some((c) => /platform/i.test(c.label))).toBe(true);
  });

  it("every canonical role has at least one chip, each with a non-empty prompt", () => {
    for (const r of ROLES) {
      const chips = qSuggestionChips([r]);
      expect(chips.length).toBeGreaterThan(0);
      expect(chips.every((c) => c.prompt.length > 0 && c.label.length > 0)).toBe(true);
    }
  });
});

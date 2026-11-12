import { describe, expect, it } from "vitest";
import { gateAccessLimitedToTesting, isTestingCheckpoint } from "@/lib/testing-gates";

// UX9 (D10) — testing gates and the Head of QA limit.
describe("isTestingCheckpoint", () => {
  it("treats SIT and UAT (entry/exit) and testing-named gates as testing gates while unset", () => {
    for (const name of ["SIT", "UAT", "SIT entry", "UAT exit", "Testing", "System testing"]) expect(isTestingCheckpoint({ name, testing: null })).toBe(true);
    for (const name of ["BRD", "Prototype", "MVP1", "Go-Live", "Business Case", "Contest launch"]) expect(isTestingCheckpoint({ name })).toBe(false);
  });

  it("lets an explicit flag win either way", () => {
    expect(isTestingCheckpoint({ name: "Pilot", testing: true })).toBe(true);
    expect(isTestingCheckpoint({ name: "UAT", testing: false })).toBe(false);
  });
});

describe("gateAccessLimitedToTesting", () => {
  it("limits a Head of QA who doesn't run the project", () => {
    expect(gateAccessLimitedToTesting(["HeadOfQA"], false)).toBe(true);
  });
  it("doesn't limit them on a project they run, or when they hold a full-gate role", () => {
    expect(gateAccessLimitedToTesting(["HeadOfQA"], true)).toBe(false);
    expect(gateAccessLimitedToTesting(["HeadOfQA", "HeadOfProjects"], false)).toBe(false);
    expect(gateAccessLimitedToTesting(["HeadOfQA", "PlatformSuperAdmin"], false)).toBe(false);
  });
  it("never limits other roles", () => {
    expect(gateAccessLimitedToTesting(["HeadOfProjects"], false)).toBe(false);
    expect(gateAccessLimitedToTesting(["ProjectManager"], false)).toBe(false);
  });
});

describe("gateWriteScope (D10, UX10)", () => {
  it("gives Executives no gates, Head of QA testing gates, Heads and Super Admin all", async () => {
    const { gateWriteScope } = await import("@/lib/testing-gates");
    expect(gateWriteScope(["Executive"], false)).toBe("none");
    expect(gateWriteScope(["Executive", "HeadOfQA"], false)).toBe("testing");
    expect(gateWriteScope(["Executive", "HeadOfProjects"], false)).toBe("all");
    expect(gateWriteScope(["Executive"], true)).toBe("all"); // runs the project
    expect(gateWriteScope(["PlatformSuperAdmin"], false)).toBe("all");
    expect(gateWriteScope(["HeadOfQA"], false)).toBe("testing");
  });
});

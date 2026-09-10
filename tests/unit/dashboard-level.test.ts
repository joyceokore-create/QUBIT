import { describe, expect, it } from "vitest";
import { resolveLevel, allowedLevels, resolveRequestedLevel } from "@/lib/dashboard-level";

describe("dashboard level resolution", () => {
  it("resolves the highest canonical role to its level", () => {
    expect(resolveLevel(["PlatformSuperAdmin"])).toBe("superadmin");
    expect(resolveLevel(["HeadOfProjects"])).toBe("head");
    expect(resolveLevel(["HeadOfQA"])).toBe("head");
    expect(resolveLevel(["Executive"])).toBe("exec");
    expect(resolveLevel(["ProjectManager"])).toBe("pm");
    expect(resolveLevel(["Member"])).toBe("user");
    expect(resolveLevel([])).toBe("user");
  });

  it("takes the most-privileged when a user holds several roles", () => {
    expect(resolveLevel(["Member", "ProjectManager", "HeadOfProjects"])).toBe("head");
    expect(resolveLevel(["ProjectManager", "PlatformSuperAdmin"])).toBe("superadmin");
  });

  it("unknown/custom roles alone fall back to user", () => {
    expect(resolveLevel(["Finance Reviewer"])).toBe("user");
  });

  it("allows downward-only preview", () => {
    expect(allowedLevels(["PlatformSuperAdmin"])).toEqual(["superadmin", "exec", "head", "pm", "user"]);
    expect(allowedLevels(["ProjectManager"])).toEqual(["pm", "user"]);
    expect(allowedLevels(["Member"])).toEqual(["user"]);
    expect(allowedLevels(["Executive"])).toEqual(["exec", "head", "pm", "user"]);
  });

  it("validates a requested level against what the viewer may see", () => {
    expect(resolveRequestedLevel(["PlatformSuperAdmin"], "pm")).toBe("pm");
    // A PM cannot preview upward → falls back to their own level.
    expect(resolveRequestedLevel(["ProjectManager"], "exec")).toBe("pm");
    expect(resolveRequestedLevel(["ProjectManager"], "bogus")).toBe("pm");
    expect(resolveRequestedLevel(["Member"], undefined)).toBe("user");
  });
});

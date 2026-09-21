import { describe, expect, it } from "vitest";
import { sanitizeCallbackUrl } from "@/lib/callback-url";

describe("sanitizeCallbackUrl", () => {
  it("keeps ordinary relative paths, including query and hash", () => {
    expect(sanitizeCallbackUrl("/projects/p1?tab=risks#top")).toBe("/projects/p1?tab=risks#top");
    expect(sanitizeCallbackUrl("/dashboard")).toBe("/dashboard");
  });

  it("falls back for absolute and protocol-relative URLs", () => {
    expect(sanitizeCallbackUrl("https://evil.example/")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("//evil.example")).toBe("/dashboard");
  });

  it("rejects the backslash bypass — WHATWG treats \\ as / for special schemes", () => {
    expect(sanitizeCallbackUrl("/\\evil.example")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("/\\/evil.example")).toBe("/dashboard");
  });

  it("rejects tab/newline smuggling — WHATWG strips them before parsing", () => {
    expect(sanitizeCallbackUrl("/\t\\evil.example")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("/\n/evil.example")).toBe("/dashboard");
  });

  it("falls back when missing or not path-relative", () => {
    expect(sanitizeCallbackUrl(undefined)).toBe("/dashboard");
    expect(sanitizeCallbackUrl("evil.example")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("javascript:alert(1)")).toBe("/dashboard");
  });
});

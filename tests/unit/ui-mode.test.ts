// UX plan D11 — a person's stored layout wins; otherwise the FEATURE_NEW_UI default.
import { describe, expect, it } from "vitest";
import { effectiveUiMode, newUiDefault, UiModeInput } from "@/lib/ui-mode";

describe("effectiveUiMode", () => {
  it("honours the stored choice either way", () => {
    expect(effectiveUiMode("classic", true)).toBe("classic");
    expect(effectiveUiMode("new", false)).toBe("new");
  });
  it("follows the default when nothing (or junk) is stored", () => {
    expect(effectiveUiMode(null, true)).toBe("new");
    expect(effectiveUiMode(undefined, false)).toBe("classic");
    expect(effectiveUiMode("beta", false)).toBe("classic");
  });
  it("reads FEATURE_NEW_UI like the other flags", () => {
    expect(newUiDefault({ FEATURE_NEW_UI: "on" })).toBe(true);
    expect(newUiDefault({ FEATURE_NEW_UI: "1" })).toBe(true);
    expect(newUiDefault({})).toBe(false);
  });
  it("validates the API body", () => {
    expect(UiModeInput.safeParse({ mode: "classic" }).success).toBe(true);
    expect(UiModeInput.safeParse({ mode: "beta" }).success).toBe(false);
  });
});

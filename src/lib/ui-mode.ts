import { z } from "zod";

/**
 * Staged rollout of the new home pages (UX plan D11). A person's stored choice wins;
 * with none stored they follow the tenant-wide default (FEATURE_NEW_UI, off until the
 * pilot ends). Pure, so the rule is unit-testable and readable by server components.
 */
export const UI_MODES = ["new", "classic"] as const;
export type UiMode = (typeof UI_MODES)[number];

export const UiModeInput = z.object({ mode: z.enum(UI_MODES) });

/** The env default, read at call time like the other feature flags (src/lib/flags.ts). */
export function newUiDefault(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.FEATURE_NEW_UI;
  return v === "1" || v === "true" || v === "on";
}

/** Effective layout: the stored choice, else the default. Unknown stored values are ignored. */
export function effectiveUiMode(stored: string | null | undefined, defaultNew = newUiDefault()): UiMode {
  if (stored === "new" || stored === "classic") return stored;
  return defaultNew ? "new" : "classic";
}

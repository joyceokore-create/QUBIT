/**
 * Feature flags (docs/16-revamp-plan.md, M0). Env-driven, default OFF, evaluated at call
 * time so tests can toggle. Server-side only — never expose a flag decision to the client
 * except through what the server renders.
 */

const FLAG_ENV = {
  /** ClickUp spaces surface — code removed in the M0 cull; reserved so any return is deliberate. */
  spaces: "FEATURE_SPACES",
  /** Outbound email via the Mailer interface (lands M5). */
  email: "FEATURE_EMAIL",
  /** GitHub commit → task automation (lands M7). */
  commitAutomation: "FEATURE_COMMIT_AUTOMATION",
} as const;

export type FeatureFlag = keyof typeof FLAG_ENV;

export function flagEnabled(flag: FeatureFlag): boolean {
  const v = process.env[FLAG_ENV[flag]];
  return v === "1" || v === "true" || v === "on";
}

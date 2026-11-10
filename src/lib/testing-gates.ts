import { gateKeyOf } from "@/lib/cockpit-gates";

/**
 * UX9 (UX plan D10) — which gates are TESTING gates. Head of QA may set only these; everyone
 * else's gate access is unchanged. A checkpoint's own `testing` flag wins when an admin has set
 * it (true or false); while it is unset (null) the gate's name decides: SIT and UAT (entry and
 * exit) are testing gates, as is any gate named for testing. Pure and client-safe.
 */
export const TESTING_GATE_KEYS = ["sit", "uat"] as const;

const TESTING_NAME = /\b(sit|uat|testing|test)\b/i;

export function isTestingCheckpoint(c: { name: string; testing?: boolean | null }): boolean {
  if (c.testing === true || c.testing === false) return c.testing;
  const key = gateKeyOf(c.name);
  if (key && (TESTING_GATE_KEYS as readonly string[]).includes(key)) return true;
  // "SIT entry", "UAT exit", "System testing", "Testing" …
  return TESTING_NAME.test(c.name.replace(/[^a-z0-9 ]/gi, " "));
}

/** The roles whose gate access is NOT limited to testing gates (they hold it in full). */
const FULL_GATE_ROLES = ["PlatformSuperAdmin", "HeadOfProjects", "Executive"] as const;

/**
 * D10: a Head of QA's gate access is limited to testing gates — unless they also hold a role
 * with full gate access, or run the project themselves (then the PM rule applies).
 */
export function gateAccessLimitedToTesting(roles: readonly string[], runsProject: boolean): boolean {
  if (runsProject) return false;
  if (!roles.includes("HeadOfQA")) return false;
  return !FULL_GATE_ROLES.some((r) => roles.includes(r));
}

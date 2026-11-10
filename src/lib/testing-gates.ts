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

/** The roles that set any gate on any project (D10). */
const FULL_GATE_ROLES = ["PlatformSuperAdmin", "HeadOfProjects"] as const;

export type GateScope = "all" | "testing" | "none";

/**
 * D10 — which gates a person may set on a project, ON TOP of holding the gate permission
 * (`project:stage`) or running the project:
 *  - the project's own PM/lead (runsProject), Super Admin and Head → every gate;
 *  - Head of QA → testing gates only (UX9);
 *  - Executive → none: Executives act through Decisions ("no authoring", docs/07), UX10.
 * A person with several roles gets the widest scope they hold.
 */
export function gateWriteScope(roles: readonly string[], runsProject: boolean): GateScope {
  if (runsProject || FULL_GATE_ROLES.some((r) => roles.includes(r))) return "all";
  if (roles.includes("HeadOfQA")) return "testing";
  if (roles.includes("Executive")) return "none";
  return "all"; // any other holder of project:stage (e.g. a custom role) keeps today's access
}

/** UX9 helper, kept for callers: true when the scope is testing gates only. */
export function gateAccessLimitedToTesting(roles: readonly string[], runsProject: boolean): boolean {
  return gateWriteScope(roles, runsProject) === "testing";
}

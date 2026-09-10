// The Delivery Cockpit is chosen by the viewer's RBAC ROLE LEVEL (not persona). Five levels,
// most- to least-privileged. Pure + client-safe so both the server page and the client-side
// level switcher share one source of truth.

export const DASHBOARD_LEVELS = ["superadmin", "exec", "head", "pm", "user"] as const;
export type DashboardLevel = (typeof DASHBOARD_LEVELS)[number];

export const LEVEL_LABEL: Record<DashboardLevel, string> = {
  superadmin: "Super Admin",
  exec: "Executive",
  head: "Head of PMs",
  pm: "Project Manager",
  user: "My work",
};

/** Highest canonical role → the level whose cockpit the viewer lands on. */
export function resolveLevel(roles: readonly string[]): DashboardLevel {
  if (roles.includes("PlatformSuperAdmin")) return "superadmin";
  if (roles.includes("HeadOfProjects") || roles.includes("HeadOfQA")) return "head";
  if (roles.includes("Executive")) return "exec";
  if (roles.includes("ProjectManager")) return "pm";
  return "user";
}

// Downward-only preview, honouring QUBIT's "global read" model: a viewer may inspect their
// own level and any level below it, never above. Super Admin (and Executive, read-everything)
// therefore see the whole ladder; a PM sees PM + User; a User sees only their own.
const LADDER: DashboardLevel[] = ["superadmin", "exec", "head", "pm", "user"];

export function allowedLevels(roles: readonly string[]): DashboardLevel[] {
  const own = resolveLevel(roles);
  // Executive is read-everything but sits below the two Heads/Super Admin in privilege; it may
  // still preview the operational levels beneath it.
  const start = own === "exec" ? LADDER.indexOf("exec") : LADDER.indexOf(own);
  return LADDER.slice(start);
}

/** Validate a requested ?level= against what the viewer may see; fall back to their own. */
export function resolveRequestedLevel(roles: readonly string[], requested: unknown): DashboardLevel {
  const own = resolveLevel(roles);
  if (typeof requested === "string" && (DASHBOARD_LEVELS as readonly string[]).includes(requested)) {
    const lvl = requested as DashboardLevel;
    if (allowedLevels(roles).includes(lvl)) return lvl;
  }
  return own;
}

/**
 * Who MUST have a second factor (docs/23 §6.1).
 *
 * The line is drawn at "can this person see or change things across the whole tenant":
 * a compromised Super Admin, head, or Executive account is a tenant-wide event, so those
 * roles cannot finish onboarding without enrolling. Everyone else is prompted and may
 * skip once — a hard requirement there would block delivery work on a phone somebody
 * left at home, which trades real friction for little marginal safety.
 *
 * Pure, so the same predicate gates the UI and the server (docs/23 §6.1 enforces it in
 * /api/onboarding/finish — the UI hiding a step is never the control).
 */
const MFA_REQUIRED_ROLES = ["PlatformSuperAdmin", "HeadOfProjects", "HeadOfQA", "Executive"];

export function mfaRequired(roles: string[]): boolean {
  return roles.some((r) => MFA_REQUIRED_ROLES.includes(r));
}

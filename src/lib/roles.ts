// Shared role vocabularies (MVP1 PRD). Two distinct concepts:
//  1. System roles (RBAC) — what a user can DO in the app; see src/lib/rbac.ts.
//  2. Project roles — the HAT a person wears on a specific project (PRD Module 2).

/**
 * PRD Module 2 "Project Team" — the defined project-team roles a person can hold on a
 * project. Used by the project resource assignment UI so roles are consistent, not
 * free-text.
 */
export const PROJECT_ROLES = [
  "Sponsor",
  "Business Owner",
  "Project Manager",
  "Product Owner",
  "Business Analyst",
  "Technical Lead",
  "QA Lead",
  "QA Engineer",
  "Developer",
  "UX Designer",
  "Stakeholder",
] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/**
 * Phase 6.1 (DM1.15 №1) — collapse a project role into the category the delivery workflow
 * keys off: board lenses, QA write scope, nudger escalation. Unknown/legacy free-text
 * (e.g. old join-request roles) deliberately lands on Stakeholder — read-mostly, never a
 * write grant it shouldn't have.
 */
export type ProjectRoleCategory = "PM" | "Dev" | "QA" | "Stakeholder";
export function projectRoleCategory(role: string): ProjectRoleCategory {
  switch (role) {
    case "Project Manager":
      return "PM";
    case "Technical Lead":
    case "Developer":
    case "UX Designer":
      return "Dev";
    case "QA Lead":
    case "QA Engineer":
      return "QA";
    default:
      return "Stakeholder";
  }
}

/**
 * PRD §5 User Roles — the four system tiers surfaced during onboarding, each mapped to an
 * RBAC role key (src/lib/rbac.ts). Onboarding presents these friendly tiers; power users
 * can still fine-tune the raw role set afterwards via "Edit roles".
 */
export const ONBOARDING_ROLE_TIERS = [
  {
    key: "PlatformSuperAdmin",
    label: "Administrator",
    desc: "Full system administration — users, roles, and settings.",
  },
  {
    key: "Executive",
    label: "Executive",
    desc: "Read-everything portfolio visibility and executive reports.",
  },
  {
    key: "ProjectManager",
    label: "Project Manager",
    desc: "Create & manage projects, teams, tasks, milestones and risks.",
  },
  {
    key: "Member",
    label: "Member",
    desc: "Execute assigned tasks and update their progress.",
  },
] as const;
// HeadOfProjects / HeadOfQA are assigned via "Edit roles" (power-user path), not the
// onboarding quick-pick — they are governance roles, not a common onboarding tier.
export type OnboardingRoleKey = (typeof ONBOARDING_ROLE_TIERS)[number]["key"];

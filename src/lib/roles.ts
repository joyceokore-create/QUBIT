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
  "Developer",
  "UX Designer",
  "Stakeholder",
] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/**
 * PRD §5 User Roles — the four system tiers surfaced during onboarding, each mapped to an
 * RBAC role key (src/lib/rbac.ts). Onboarding presents these friendly tiers; power users
 * can still fine-tune the raw role set afterwards via "Edit roles".
 */
export const ONBOARDING_ROLE_TIERS = [
  {
    key: "SystemAdmin",
    label: "Administrator",
    desc: "Full system administration — users, roles, and settings.",
  },
  {
    key: "Executive",
    label: "Executive",
    desc: "Read-only portfolio visibility and executive reports.",
  },
  {
    key: "ProjectManager",
    label: "Project Manager",
    desc: "Create & manage projects, teams, tasks, milestones and risks.",
  },
  {
    key: "Contributor",
    label: "Member",
    desc: "Execute assigned tasks and update their progress.",
  },
] as const;
export type OnboardingRoleKey = (typeof ONBOARDING_ROLE_TIERS)[number]["key"];

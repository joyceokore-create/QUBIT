import { z } from "zod";

/** Roles a person may ask for on the public form (UX fidelity D-F3). Super Admin is never
 * requestable; the admin still chooses the real role when granting. */
export const REQUESTABLE_ROLES = [
  { key: "Member", label: "Member" },
  { key: "ProjectManager", label: "Project Manager" },
  { key: "HeadOfQA", label: "Head of QA" },
  { key: "HeadOfProjects", label: "Head" },
  { key: "Executive", label: "Executive" },
] as const;
export type RequestableRole = (typeof REQUESTABLE_ROLES)[number]["key"];
const ROLE_KEYS = REQUESTABLE_ROLES.map((r) => r.key) as [RequestableRole, ...RequestableRole[]];

export function requestedRoleLabel(key: string | null | undefined): string | null {
  return REQUESTABLE_ROLES.find((r) => r.key === key)?.label ?? null;
}

/**
 * Validation for the public "Get started" request-access form. Shared by the client form
 * (src/app/(auth)/request-access/request-access-form.tsx) and the unauthenticated route
 * (src/app/api/access-request/route.ts). `companyUrl` is a honeypot: it is never rendered to
 * real users, so a non-empty value marks a bot (the route drops it silently).
 */
export const accessRequestSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your full name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid work email.").max(190),
  company: z.string().trim().min(1, "Enter your company name.").max(160),
  jobTitle: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  requestedRole: z
    .enum(ROLE_KEYS)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  // No personal details asked for; length-capped and stored as plain text (escaped on output).
  reason: z
    .string()
    .trim()
    .max(300, "Keep the reason under 300 characters.")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  companyUrl: z.string().max(200).optional(), // honeypot — must be empty for humans
});

export type AccessRequestInput = z.infer<typeof accessRequestSchema>;

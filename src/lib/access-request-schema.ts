import { z } from "zod";

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
  companyUrl: z.string().max(200).optional(), // honeypot — must be empty for humans
});

export type AccessRequestInput = z.infer<typeof accessRequestSchema>;

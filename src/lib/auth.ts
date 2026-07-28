import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/lib/auth.config";
import { withTenant } from "@/lib/tenant";
import { resolveTenantByEmailDomain } from "@/lib/tenant-domain";
import { verifyPassword } from "@/lib/password";
import { decryptMfaSecret, verifyTotp } from "@/lib/mfa";
import { checkRateLimit, recordFailure, resetRateLimit } from "@/lib/rate-limit";
import { derivedGroups, effectiveGroups, landingPersona } from "@/lib/personas";
import { projectRoleCategory } from "@/lib/roles";
import { resolvePermissionsForRoles } from "@/server/role-permissions";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        totpCode: {},
      },
      async authorize(raw) {
        const parsed = CredentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, totpCode } = parsed.data;
        const normalizedEmail = email.toLowerCase();
        const rateLimitKey = `login:${normalizedEmail}`;

        const rl = checkRateLimit(rateLimitKey);
        if (!rl.allowed) {
          throw new Error("Too many login attempts. Please try again later.");
        }

        // No organization selector — the email's domain tells us the tenant.
        const tenant = await resolveTenantByEmailDomain(normalizedEmail);
        if (!tenant) {
          recordFailure(rateLimitKey);
          return null;
        }

        const user = await withTenant({ tenantId: tenant.id, userId: "auth" }, (tx) =>
          tx.user.findUnique({
            where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
            include: {
              roles: true,
              // Persona derivation (docs/17 §1.1): membership roles + whether they lead.
              projectAllocations: { select: { role: true } },
              projectsLed: { select: { id: true }, take: 1 },
            },
          }),
        );

        if (!user || !user.passwordHash || user.status !== "ACTIVE") {
          recordFailure(rateLimitKey);
          return null;
        }

        const validPassword = await verifyPassword(password, user.passwordHash);
        if (!validPassword) {
          recordFailure(rateLimitKey);
          return null;
        }

        if (user.mfaSecret) {
          // Uniform failure for a missing or wrong code — never reveal which factor failed.
          const secret = decryptMfaSecret(user.mfaSecret);
          if (!totpCode || !(await verifyTotp(secret, totpCode))) {
            recordFailure(rateLimitKey);
            return null;
          }
        }

        resetRateLimit(rateLimitKey);

        const roles = user.roles.map((r) => r.role);
        // Resolve effective permissions once, at login, and bake them into the session so
        // can() stays synchronous. Honours any tenant role-permission overrides (Phase 1.5).
        const permissions = await withTenant({ tenantId: tenant.id, userId: user.id }, (tx) =>
          resolvePermissionsForRoles(tx, tenant.id, roles),
        );

        // Dashboard personas (docs/17 §1) — presentation only, same lifecycle as
        // permissions: effective groups = declared ∪ derived, landing = last > primary > priority.
        const personas = effectiveGroups(
          user.userGroups,
          derivedGroups({
            membershipCategories: user.projectAllocations.map((m) => projectRoleCategory(m.role)),
            tenantRoles: roles,
            leadsProjects: user.projectsLed.length > 0,
          }),
        );
        const activePersona = landingPersona(personas, user.primaryGroup, user.lastPersona);

        // Record last sign-in (onboarding tracking) — best-effort, never blocks login.
        await withTenant({ tenantId: tenant.id, userId: user.id }, (tx) =>
          tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
        ).catch(() => {});

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          roles,
          permissions,
          personas,
          activePersona,
          brandColor: tenant.brandColor,
          brandLight: tenant.brandLight,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
});

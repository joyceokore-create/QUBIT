import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import { verifyPassword } from "@/lib/password";
import { decryptMfaSecret, verifyTotp } from "@/lib/mfa";
import { checkRateLimit, recordFailure, resetRateLimit } from "@/lib/rate-limit";

const CredentialsSchema = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        tenantSlug: {},
        email: {},
        password: {},
        totpCode: {},
      },
      async authorize(raw) {
        const parsed = CredentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { tenantSlug, email, password, totpCode } = parsed.data;
        const normalizedEmail = email.toLowerCase();
        const rateLimitKey = `${tenantSlug}:${normalizedEmail}`;

        const rl = checkRateLimit(rateLimitKey);
        if (!rl.allowed) {
          throw new Error("Too many login attempts. Please try again later.");
        }

        const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!tenant) {
          recordFailure(rateLimitKey);
          return null;
        }

        const user = await withTenant({ tenantId: tenant.id, userId: "auth" }, (tx) =>
          tx.user.findUnique({
            where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
            include: { roles: true },
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

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: tenant.id,
          tenantName: tenant.name,
          roles: user.roles.map((r) => r.role),
          brandColor: tenant.brandColor,
          brandLight: tenant.brandLight,
        };
      },
    }),
  ],
});

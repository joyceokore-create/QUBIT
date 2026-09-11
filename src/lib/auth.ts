import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { z } from "zod";
import { authConfig } from "@/lib/auth.config";
import { withTenant } from "@/lib/tenant";
import { resolveTenantByEmailDomain } from "@/lib/tenant-domain";
import { verifyPassword } from "@/lib/password";
import { checkRateLimit, recordFailure, resetRateLimit } from "@/lib/rate-limit";
import { derivedGroups, effectiveGroups, landingPersona } from "@/lib/personas";
import { projectRoleCategory } from "@/lib/roles";
import { entraIssuer, ssoEnabled, SSO_DENIED_REDIRECT, SSO_PROVIDER_ID } from "@/lib/sso";
import { resolvePermissionsForRoles } from "@/server/role-permissions";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type LoginTenant = NonNullable<Awaited<ReturnType<typeof resolveTenantByEmailDomain>>>;
type LoginUser = NonNullable<Awaited<ReturnType<typeof findLoginUser>>>;

// The one lookup both sign-in paths (password and SSO) share.
function findLoginUser(tenantId: string, email: string) {
  return withTenant({ tenantId, userId: "auth" }, (tx) =>
    tx.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
      include: {
        roles: true,
        // Persona derivation (docs/17 §1.1): membership roles + whether they lead.
        projectAllocations: { select: { role: true } },
        projectsLed: { select: { id: true }, take: 1 },
      },
    }),
  );
}

// Assemble the session user identically for both paths: effective permissions and
// personas resolved once at login, lastLoginAt recorded best-effort.
async function buildSessionUser(tenant: LoginTenant, user: LoginUser) {
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
}

// The edge-safe callbacks live in authConfig; compose over them here (Node runtime) so we
// can read the DB. Preserves the initial-sign-in hydration and adds the authoritative
// re-read of the onboarding gate.
const baseCallbacks = authConfig.callbacks!;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...baseCallbacks,
    // SSO gate: Entra authenticated the person (including the org's MFA policy) — this
    // decides whether they exist HERE. No auto-provisioning: the email must map to an
    // existing ACTIVE user under the tenant its domain resolves to. Every failure takes
    // the same exit (uniform — no user-existence disclosure), and the string return
    // redirects before any session is minted.
    async signIn({ user, account, profile }) {
      if (account?.provider !== SSO_PROVIDER_ID) return true; // credentials: authorize() decides
      // Entra may omit the `email` claim (populated only when the directory user has a
      // `mail` attribute); the sign-in address then lives in the UPN (preferred_username).
      const claims = profile as { email?: string; preferred_username?: string; upn?: string } | undefined;
      const email = (claims?.email ?? claims?.preferred_username ?? claims?.upn)?.toLowerCase();
      if (!email) return SSO_DENIED_REDIRECT;

      const rateLimitKey = `sso:${email}`;
      if (!checkRateLimit(rateLimitKey).allowed) return SSO_DENIED_REDIRECT;

      const tenant = await resolveTenantByEmailDomain(email);
      const dbUser = tenant ? await findLoginUser(tenant.id, email) : null;
      if (!tenant || !dbUser || dbUser.status !== "ACTIVE") {
        recordFailure(rateLimitKey);
        return SSO_DENIED_REDIRECT;
      }
      resetRateLimit(rateLimitKey);

      // With no adapter, this exact object reaches the jwt callback as `user`, so the
      // edge hydration in auth.config.ts works unchanged and token.sub becomes our DB id.
      Object.assign(user, await buildSessionUser(tenant, dbUser));
      return true;
    },
    async jwt(params) {
      const token = (await baseCallbacks.jwt!(params)) as JWT | null;
      if (!token) return token;
      // Fail closed: an Entra sign-in must never mint a token without tenant hydration
      // (returning null clears the session cookie).
      if (params.account?.provider === SSO_PROVIDER_ID && !token.tenantId) return null;
      // Security: never trust client-supplied session data to lift the onboarding gate.
      // On an explicit session refresh, re-read `mustChangePassword` from the DB — this is
      // what the onboarding form triggers after a real password reset, and what a forged
      // update() cannot fake. RLS-scoped to the user's own row.
      if (params.trigger === "update" && token.sub && token.tenantId) {
        const fresh = await withTenant(
          { tenantId: token.tenantId, userId: token.sub },
          (tx) => tx.user.findUnique({ where: { id: token.sub! }, select: { mustChangePassword: true } }),
        ).catch(() => null);
        if (fresh) token.mustChangePassword = fresh.mustChangePassword;
      }
      return token;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(raw) {
        const parsed = CredentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
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

        const user = await findLoginUser(tenant.id, normalizedEmail);
        if (!user || !user.passwordHash || user.status !== "ACTIVE") {
          recordFailure(rateLimitKey);
          return null;
        }

        const validPassword = await verifyPassword(password, user.passwordHash);
        if (!validPassword) {
          recordFailure(rateLimitKey);
          return null;
        }

        resetRateLimit(rateLimitKey);
        return buildSessionUser(tenant, user);
      },
    }),
    // Active only when all three AZURE_AD_* env vars are set. The issuer pin means only
    // tokens from the org's own directory validate — Entra owns MFA/conditional access,
    // which is why the app-level TOTP step was removed from login.
    ...(ssoEnabled()
      ? [
          MicrosoftEntraID({
            clientId: process.env.AZURE_AD_CLIENT_ID!,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
            issuer: entraIssuer(),
            // Default scope includes User.Read and the default profile() embeds a base64
            // Graph photo into the JWT cookie — skip both.
            authorization: { params: { scope: "openid profile email" } },
            profile(p) {
              // Tenant fields are hydrated in the signIn callback from the DB user; the
              // jwt guard above fails closed if that ever doesn't happen.
              return {
                id: p.sub,
                name: p.name ?? null,
                email: p.email?.toLowerCase() ?? null,
                image: null,
              } as unknown as import("next-auth").User;
            },
          }),
        ]
      : []),
  ],
});

import type { NextAuthConfig } from "next-auth";

// Edge-safe half of the Auth.js config — no Prisma here. middleware.ts runs on the Edge
// runtime, which cannot load the Prisma query engine, so providers (which need DB access)
// are added separately in src/lib/auth.ts (Node runtime only).
export const authConfig = {
  pages: { signIn: "/login" },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24, // 24h — NFR-04
  },
  callbacks: {
    // Edge-safe: hydrate the token from the user on initial sign-in only. The
    // `mustChangePassword` gate must NOT be lifted from client-supplied session data — a
    // browser could otherwise clear it without ever resetting the temp password. The
    // authoritative re-read from the DB on `trigger === "update"` lives in the Node-runtime
    // instance in src/lib/auth.ts (Prisma can't load on the Edge runtime this file targets).
    jwt({ token, user }) {
      if (user) {
        token.tenantId = user.tenantId;
        token.tenantSlug = user.tenantSlug;
        token.tenantName = user.tenantName;
        token.roles = user.roles;
        token.permissions = user.permissions;
        token.personas = user.personas;
        token.activePersona = user.activePersona;
        token.brandColor = user.brandColor;
        token.brandLight = user.brandLight;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.tenantId = token.tenantId as string;
      session.user.tenantSlug = token.tenantSlug as string;
      session.user.tenantName = token.tenantName as string;
      session.user.roles = token.roles as string[];
      session.user.permissions = (token.permissions as string[] | undefined) ?? [];
      session.user.personas = (token.personas as string[] | undefined) ?? [];
      session.user.activePersona = (token.activePersona as string | undefined) ?? "developer";
      session.user.brandColor = token.brandColor as string;
      session.user.brandLight = token.brandLight as string;
      session.user.mustChangePassword = Boolean(token.mustChangePassword);
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;

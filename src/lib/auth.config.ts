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
    jwt({ token, user }) {
      if (user) {
        token.tenantId = user.tenantId;
        token.tenantName = user.tenantName;
        token.roles = user.roles;
        token.brandColor = user.brandColor;
        token.brandLight = user.brandLight;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.tenantId = token.tenantId as string;
      session.user.tenantName = token.tenantName as string;
      session.user.roles = token.roles as string[];
      session.user.brandColor = token.brandColor as string;
      session.user.brandLight = token.brandLight as string;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;

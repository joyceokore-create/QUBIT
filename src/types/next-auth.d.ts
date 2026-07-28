import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    roles: string[];
    permissions: string[];
    /** Effective dashboard personas (docs/17 §1) — presentation only, never permission. */
    personas: string[];
    /** Landing preset resolved at login (last-used > primary > priority). */
    activePersona: string;
    brandColor: string;
    brandLight: string;
    mustChangePassword?: boolean;
  }

  interface Session {
    user: {
      id: string;
      tenantId: string;
      tenantSlug: string;
      tenantName: string;
      roles: string[];
      permissions: string[];
      personas: string[];
      activePersona: string;
      brandColor: string;
      brandLight: string;
      mustChangePassword?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenantId?: string;
    tenantSlug?: string;
    tenantName?: string;
    roles?: string[];
    permissions?: string[];
    personas?: string[];
    activePersona?: string;
    brandColor?: string;
    brandLight?: string;
    mustChangePassword?: boolean;
  }
}

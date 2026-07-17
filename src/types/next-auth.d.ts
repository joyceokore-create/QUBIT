import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    roles: string[];
    permissions: string[];
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
    brandColor?: string;
    brandLight?: string;
    mustChangePassword?: boolean;
  }
}

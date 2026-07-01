import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    tenantId: string;
    tenantName: string;
    roles: string[];
    brandColor: string;
    brandLight: string;
  }

  interface Session {
    user: {
      tenantId: string;
      tenantName: string;
      roles: string[];
      brandColor: string;
      brandLight: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenantId?: string;
    tenantName?: string;
    roles?: string[];
    brandColor?: string;
    brandLight?: string;
  }
}

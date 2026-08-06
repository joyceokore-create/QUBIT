import { prisma } from "@/lib/db";

function extractEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

/**
 * Resolves which tenant an email belongs to by its domain, so login only needs an email
 * — no organization selector. The `tenant` table has no RLS (it isn't itself
 * tenant-owned), so this is a safe, unauthenticated lookup. Returns null if the domain
 * isn't registered to any tenant.
 */
export async function resolveTenantByEmailDomain(email: string) {
  const domain = extractEmailDomain(email);
  if (!domain) return null;
  return prisma.tenant.findFirst({ where: { domains: { has: domain } } });
}

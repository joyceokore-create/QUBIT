import "server-only";
import { containsText } from "@/lib/list-query";
import { z } from "zod";
import { can } from "@/lib/rbac";
import { withTenant, type TenantContext } from "@/lib/tenant";

/**
 * ⌘K search (UX plan UX3). Searches what the person may read — projects, portfolios and
 * people — under the tenant's RLS context, with parameterised `contains` queries (Prisma),
 * capped per kind. "Viewing as" never narrows it (D2a): it follows real permissions.
 * Pages are matched in the browser from the person's own menu.
 */
export const SearchInput = z.object({ q: z.string().trim().min(2, "Type at least 2 characters.").max(80) });

export interface SearchHit {
  kind: "project" | "portfolio" | "person";
  id: string;
  label: string;
  sub: string | null;
  href: string;
}

const PER_KIND = 6;

export async function search(ctx: TenantContext, q: string): Promise<SearchHit[]> {
  const like = containsText(q); // wildcards escaped: "%" searches for a literal %
  const canProjects = can(ctx, "project:read");
  const canPortfolios = can(ctx, "portfolio:read");
  return withTenant(ctx, async (tx) => {
    const [projects, portfolios, people] = await Promise.all([
      canProjects
        ? tx.project.findMany({
            where: { OR: [{ name: like }, { code: like }] },
            select: { id: true, name: true, code: true, status: true },
            orderBy: { name: "asc" },
            take: PER_KIND,
          })
        : [],
      canPortfolios
        ? tx.portfolio.findMany({ where: { name: like }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: PER_KIND })
        : [],
      // People are listed on the People page, which needs project:read.
      canProjects
        ? tx.user.findMany({
            where: { name: like, status: { not: "DELETED" } },
            select: { id: true, name: true, department: { select: { name: true } } },
            orderBy: { name: "asc" },
            take: PER_KIND,
          })
        : [],
    ]);
    return [
      ...projects.map((p) => ({ kind: "project" as const, id: p.id, label: p.name, sub: p.code, href: `/projects/${p.id}` })),
      ...portfolios.map((p) => ({ kind: "portfolio" as const, id: p.id, label: p.name, sub: null, href: `/portfolios/${p.id}` })),
      ...people.map((u) => ({ kind: "person" as const, id: u.id, label: u.name, sub: u.department?.name ?? null, href: "/people" })),
    ];
  });
}

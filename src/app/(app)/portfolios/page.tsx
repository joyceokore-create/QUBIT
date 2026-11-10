import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { withTenant } from "@/lib/tenant";
import { getPortfolioCards } from "@/server/dashboard";
import { Forbidden } from "@/components/forbidden";
import { PortfoliosClient } from "./portfolios-client";

// M-P1b (docs/25 W1 screen 2, docs/26 §5.1) — the portfolio index. Everyone reads (BASE
// grants portfolio:read); only Exec/Head see the add button.
//
// UX5 (L1–L5): the category-grouped cards become one searchable, filterable table that
// loads once and pages in the browser (a tenant has a handful of portfolios). The
// lifecycle cards and the Inactive tab arrive with UX10 (D8b).
export default async function PortfoliosPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!can(ctx, "portfolio:read")) return <Forbidden />;

  const [cards, owners] = await Promise.all([
    getPortfolioCards(ctx),
    // The portfolio owner (Exec/Head, picked in the wizard) is the sponsor the plan's
    // filter names. `ownerId` has no relation, so resolve names in one RLS-scoped read.
    withTenant(ctx, async (tx) => {
      const rows = await tx.portfolio.findMany({ where: { ownerId: { not: null } }, select: { id: true, ownerId: true } });
      const ids = [...new Set(rows.map((r) => r.ownerId).filter((v): v is string => !!v))];
      const users = ids.length ? await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
      const nameById = new Map(users.map((u) => [u.id, u.name]));
      return new Map(rows.map((r) => [r.id, r.ownerId ? (nameById.get(r.ownerId) ?? null) : null]));
    }),
  ]);

  return (
    <PortfoliosClient
      tenantName={session.user.tenantName}
      canCreate={can(ctx, "portfolio:create")}
      portfolios={cards.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        viewKind: p.viewKind,
        // A portfolio with no projects has no health yet — never a default "On track".
        health: p.itemCount === 0 ? null : p.rag,
        itemCount: p.itemCount,
        onTrack: p.onTrack,
        atRisk: p.atRisk,
        overdue: p.overdue,
        avgProgress: p.avgProgress,
        markets: p.orgUnits.map((o) => o.flag ?? o.code),
        owner: owners.get(p.id) ?? null,
      }))}
    />
  );
}

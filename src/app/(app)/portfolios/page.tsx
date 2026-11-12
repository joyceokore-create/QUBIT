import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { withTenant } from "@/lib/tenant";
import { getInitiatives } from "@/server/initiatives";
import { getTenantTimeZone } from "@/server/preferences";
import { Forbidden } from "@/components/forbidden";
import { PortfoliosClient } from "./portfolios-client";

// M-P1b (docs/25 W1 screen 2, docs/26 §5.1) — the portfolio index. Everyone reads (BASE
// grants portfolio:read).
//
// UX10 (UX plan D8a/D8b) — the page is about INITIATIVES (open ideas + projects) through
// their lifecycle: five lifecycle cards on top (Intake · Exploring · Evaluating · Approved ·
// Live), one line counting the inactive ones, then All · Pipeline · Delivery · Inactive tabs
// over one browser-paged table. The individual portfolio pages stay at /portfolios/[id] and
// are reached from the Portfolio column. Header actions follow each create permission.
export default async function PortfoliosPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!can(ctx, "portfolio:read") || !can(ctx, "project:read")) return <Forbidden />;

  const now = new Date();
  const canIdea = can(ctx, "idea:create");
  const [data, timeZone, portfolios] = await Promise.all([
    getInitiatives(ctx, now),
    getTenantTimeZone(ctx),
    // The New idea dialog's "suggested portfolio" choices — only needed when it can open.
    canIdea ? withTenant(ctx, (tx) => tx.portfolio.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })) : Promise.resolve([]),
  ]);

  return (
    <PortfoliosClient
      tenantName={session.user.tenantName}
      rows={data.rows}
      history={data.history}
      nowIso={now.toISOString()}
      timeZone={timeZone}
      portfolios={portfolios}
      can={{ idea: canIdea, project: can(ctx, "project:create"), portfolio: can(ctx, "portfolio:create") }}
    />
  );
}

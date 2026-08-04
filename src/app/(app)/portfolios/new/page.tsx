import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { eligibleOwners, listMarkets } from "@/server/portfolios";
import { Forbidden } from "@/components/forbidden";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PortfolioWizard } from "./portfolio-wizard";

// M-P1b (docs/26 §5.1) — the portfolio creation wizard. Exec / Head only.
export default async function NewPortfolioPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!can(ctx, "portfolio:create")) return <Forbidden />;

  const [markets, owners] = await Promise.all([listMarkets(ctx), eligibleOwners(ctx)]);

  return (
    <div className="mx-auto w-full max-w-[860px] px-6 py-6">
      <Breadcrumb items={[{ label: "Portfolios", href: "/portfolios" }, { label: "New portfolio" }]} />
      <h1 className="mt-2 text-[20px] font-bold tracking-[-0.4px] text-[var(--qink)]">New portfolio</h1>
      <p className="mb-5 text-[12.5px] text-[var(--ink3)]">
        A wizard, not a wall of fields — one question per step.
      </p>
      <PortfolioWizard
        userId={ctx.userId}
        markets={markets}
        owners={owners}
        selfId={ctx.userId}
      />
    </div>
  );
}

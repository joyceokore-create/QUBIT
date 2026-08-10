import Link from "next/link";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getPortfolioCards, type PortfolioCardData } from "@/server/dashboard";
import { Forbidden } from "@/components/forbidden";
import { Button } from "@/components/ui/button";

// M-P1b (docs/25 W1 screen 2, docs/26 §5.1) — the portfolio index, resurrected from the
// M0 cull as the wireframe's category-grouped square cards. Everyone reads (BASE grants
// portfolio:read); only Exec/Head see the add button.

const CATEGORY_ORDER = ["Approved", "Exploring", "Shelved"] as const;

function PortfolioCard({ p }: { p: PortfolioCardData }) {
  // DM1.73: RAG from the one health engine (worstStatus), not a hand-rolled local rule.
  const rag =
    p.itemCount === 0 ? "var(--ink5)" : p.rag === "Overdue" ? "var(--bad)" : p.rag === "AtRisk" ? "var(--warn)" : "var(--ok)";
  return (
    <Link
      href={`/portfolios/${p.id}`}
      className="flex aspect-[1.6/1] flex-col justify-between rounded-[14px] border border-[var(--w08)] bg-[var(--qcard)] p-4 transition-colors hover:border-[var(--w10)]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13.5px] leading-tight font-bold text-[var(--qink)]">{p.name}</span>
        <span className="mt-1 size-2.5 flex-none rounded-full" style={{ background: rag }} />
      </div>
      <div>
        <div className="text-[9.5px] font-semibold tracking-[0.8px] text-[var(--ink4)] uppercase">Projects</div>
        <div className="text-[20px] font-bold tracking-[-0.6px] text-[var(--qink)]">{p.itemCount}</div>
      </div>
      <div className="flex items-center gap-2 text-[10.5px] text-[var(--ink4)]">
        <span className="rounded-full border border-[var(--w08)] px-2 py-0.5 font-semibold">{p.viewKind}</span>
        {p.orgUnits.length > 0 && <span>{p.orgUnits.map((o) => o.flag ?? o.code).join(" ")}</span>}
        <span className="ml-auto">{p.avgProgress}%</span>
      </div>
    </Link>
  );
}

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

  const cards = await getPortfolioCards(ctx);
  const canCreate = can(ctx, "portfolio:create");

  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.4px] text-[var(--qink)]">Portfolios</h1>
          <p className="text-[12.5px] text-[var(--ink3)]">
            Grouped by business pipeline — Approved · Exploring · Shelved.
          </p>
        </div>
        {canCreate && (
          <Button nativeButton={false} render={<Link href="/portfolios/new" />}>
            <Plus /> New portfolio
          </Button>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="mt-8 rounded-[14px] border border-dashed border-[var(--w10)] p-10 text-center text-[12.5px] text-[var(--ink4)]">
          No portfolios yet{canCreate ? " — create the first one." : "."}
        </div>
      ) : (
        CATEGORY_ORDER.map((cat) => {
          const group = cards.filter((c) => c.category === cat);
          if (!group.length) return null;
          return (
            <section key={cat} className="mt-6">
              <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-[var(--qink)]">
                {cat}
                <span className="rounded-full border border-[var(--w08)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink4)]">
                  {group.length}
                </span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((p) => (
                  <PortfolioCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

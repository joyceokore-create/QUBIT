import Link from "next/link";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { withTenant } from "@/lib/tenant";
import { getProgrammeCards, type ProgrammeCardData } from "@/server/dashboard";
import { Forbidden } from "@/components/forbidden";
import { NewProgrammeDialog } from "../portfolios/[id]/new-programme-dialog";

// M-W1a (docs/32) — the programmes index: same category grouping as the portfolio
// cards, one level down. A card links to its parent portfolio (programmes have no
// detail page of their own — they exist to group, docs/26 §5.2).

const CATEGORY_ORDER = ["Approved", "Exploring", "Shelved"] as const;

function ProgrammeCard({ p }: { p: ProgrammeCardData }) {
  const rag =
    p.overdue > 0 ? "var(--bad)" : p.atRisk > 0 ? "var(--warn)" : p.itemCount > 0 ? "var(--ok)" : "var(--ink5)";
  return (
    <Link
      href={p.portfolioId ? `/portfolios/${p.portfolioId}` : "/portfolios"}
      className="flex flex-col justify-between gap-3 rounded-[14px] border border-[var(--w08)] bg-[var(--qcard)] p-4 transition-colors hover:border-[var(--w10)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block truncate text-[13.5px] leading-tight font-bold text-[var(--qink)]">{p.name}</span>
          <span className="text-[11px] text-[var(--ink4)]">in {p.portfolioName ?? "—"}</span>
        </div>
        <span className="mt-1 size-2.5 flex-none rounded-full" style={{ background: rag }} />
      </div>
      <div className="flex items-center gap-2 text-[10.5px] text-[var(--ink4)]">
        <span>
          {p.itemCount} project{p.itemCount === 1 ? "" : "s"}
        </span>
        <span className="ml-auto">{p.avgProgress}%</span>
      </div>
    </Link>
  );
}

export default async function ProgrammesPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!can(ctx, "programme:read")) return <Forbidden />;

  const [cards, portfolios] = await Promise.all([
    getProgrammeCards(ctx),
    can(ctx, "programme:create")
      ? withTenant(ctx, (tx) =>
          tx.portfolio.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        )
      : Promise.resolve([]),
  ]);
  const canCreate = can(ctx, "programme:create");

  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.4px] text-[var(--qink)]">Programmes</h1>
          <p className="text-[12.5px] text-[var(--ink3)]">
            Groupings between portfolio and project — Approved · Exploring · Shelved.
          </p>
        </div>
        {canCreate && <NewProgrammeDialog portfolios={portfolios} />}
      </div>

      {cards.length === 0 ? (
        <div className="mt-8 rounded-[14px] border border-dashed border-[var(--w10)] p-10 text-center text-[12.5px] text-[var(--ink4)]">
          No programmes yet{canCreate ? " — create the first one, or skip them: projects live happily directly in a portfolio." : "."}
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
                  <ProgrammeCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

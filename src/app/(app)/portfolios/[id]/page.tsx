import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getPortfolioDetail } from "@/server/projects";
import { getPortfolioSections } from "@/server/pipeline";
import { getDeltaFeedForProjects } from "@/server/delta";
import { eligibleOwners } from "@/server/portfolios";
import { blockingMap } from "@/server/project-dependencies";
import { forTenant } from "@/server/tenant-db";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { ProgrammeCard } from "@/components/portfolios/programme-card";
import { EditPortfolioDialog } from "@/components/portfolios/edit-portfolio-dialog";
import { StandaloneCardGrid } from "@/components/dashboard/standalone-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ChangedSection } from "@/components/dashboard/presets/v2-sections";
import { RAG_TOKEN } from "@/lib/surface";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewProgrammeDialog } from "./new-programme-dialog";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function HeaderStat({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className={cn("text-xl leading-none font-bold tracking-[-0.8px] text-foreground", className)}>
        {value}
      </div>
      <div className="text-[9px] font-semibold tracking-[0.6px] text-ink-3 uppercase">{label}</div>
    </div>
  );
}

// DM1.73 (Wave C, C3): WoW movement arrow — same rendering as the dashboard's
// portfolio sections (portfolio-sections.tsx SectionDelta), so the two surfaces agree.
function RagDelta({ delta }: { delta: -1 | 0 | 1 | null }) {
  if (delta === null) return null;
  if (delta > 0) return <ArrowUpRight className="size-3 text-[var(--bad)]" aria-label="worsened vs last week" />;
  if (delta < 0) return <ArrowDownRight className="size-3 text-[var(--ok)]" aria-label="improved vs last week" />;
  return <Minus className="size-3 text-[var(--ink5)] opacity-60" aria-label="unchanged vs last week" />;
}

export default async function PortfolioDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sub?: string }>;
}) {
  const { id } = await params;
  const { sub } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  const canCreate = can(ctx, "project:create");
  const canCreateProgramme = can(ctx, "programme:create");
  // D3: the edit dialog uses the same key the PATCH route guards with.
  const canEditPortfolio = can(ctx, "portfolio:create");

  // DM1.73 (Wave C, C3): this page is THE portfolio status page — it reads the same
  // section roll-up as the dashboard (one health engine, one story).
  const [portfolio, sectionsData, blockingGroups] = await Promise.all([
    getPortfolioDetail(ctx, id),
    getPortfolioSections(ctx),
    blockingMap(ctx),
  ]);
  if (!portfolio) notFound();
  // M-P2c (docs/33) — the "what's blocking what" panel, scoped to this portfolio.
  const blocking = blockingGroups.find((g) => g.portfolioId === id)?.edges ?? [];

  const section = sectionsData.sections.find((s) => s.id === id) ?? null;
  const sectionRows = section ? section.pipeline.groups.flatMap((g) => g.rows) : [];
  const confirmedCheckins = sectionRows.filter((r) => !r.unconfirmed).length;

  const [delta, owners, editable] = await Promise.all([
    // "What changed here" — the dashboard feed scoped to this portfolio's projects,
    // WITHOUT advancing the viewer's lastDashboardSeenAt pointer (dashboard-only).
    getDeltaFeedForProjects(ctx, sectionRows.map((r) => r.id)),
    canEditPortfolio ? eligibleOwners(ctx) : Promise.resolve([]),
    canEditPortfolio
      ? forTenant(ctx, (tx) =>
          tx.portfolio.findUnique({
            where: { id },
            select: { id: true, name: true, description: true, category: true, viewKind: true, ownerId: true },
          }),
        )
      : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: portfolio.name }]} />

      <div className="rounded-[10px] border border-ink-4 bg-card p-[20px_22px]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {/* DM1.73 (Wave C, C3): section RAG + WoW movement live on the status page,
                not just the dashboard — same tokens, same arrow semantics. */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-heading text-lg rv:text-heading-md font-bold tracking-[-0.3px] text-foreground">
                {portfolio.name}
              </div>
              {section && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-[6px] border px-1.5 py-0.5 font-mono text-[9px] font-bold"
                  style={{
                    color: `var(${RAG_TOKEN[section.rag]})`,
                    borderColor: `color-mix(in oklab, var(${RAG_TOKEN[section.rag]}) 35%, transparent)`,
                    background: `color-mix(in oklab, var(${RAG_TOKEN[section.rag]}) 9%, transparent)`,
                  }}
                >
                  <span className="size-1.5 rounded-full" style={{ background: `var(${RAG_TOKEN[section.rag]})` }} />
                  {section.rag.toUpperCase()}
                </span>
              )}
              {section && <RagDelta delta={section.ragDelta} />}
              {/* D3: the wizard's "everything can be changed later", kept. */}
              {canEditPortfolio && editable && <EditPortfolioDialog portfolio={editable} owners={owners} />}
            </div>
            {portfolio.description && (
              <div className="mt-[3px] max-w-[560px] text-xs rv:text-body-sm text-ink-3">{portfolio.description}</div>
            )}
            {section && (
              <div className="mt-1.5 flex flex-wrap items-center gap-3 font-mono text-[9.5px] uppercase tracking-[.8px] text-ink-3">
                {section.openBlockers > 0 && <span className="text-[var(--bad)]">{section.openBlockers} open blocker{section.openBlockers === 1 ? "" : "s"}</span>}
                {section.ownerName && <span>Owner · {section.ownerName}</span>}
                {sectionRows.length > 0 && (
                  <span className={confirmedCheckins < sectionRows.length ? "text-[var(--warn)]" : undefined}>
                    {confirmedCheckins} of {sectionRows.length} check-ins confirmed this week
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canCreateProgramme && <NewProgrammeDialog portfolioId={portfolio.id} />}
            {canCreate && (
              <Button nativeButton={false} render={<Link href={`/projects/new?portfolio=${portfolio.id}`} />}>
                <Plus /> New project
              </Button>
            )}
          </div>
        </div>
        {/* DM1.73 (T8): every status bucket shows, so the numbers reconcile to Total. */}
        <div className="flex flex-wrap gap-6">
          <HeaderStat label="Total Items" value={portfolio.itemCount} />
          <HeaderStat label="On Track" value={portfolio.onTrack} className="text-status-green" />
          <HeaderStat label="At Risk" value={portfolio.atRisk} className="text-amber" />
          <HeaderStat label="Overdue" value={portfolio.overdue} className="text-status-red" />
          <HeaderStat label="Planning" value={portfolio.planning} />
          <HeaderStat label="Done / Closed" value={portfolio.done} />
          <HeaderStat label="Avg Progress" value={`${portfolio.avgProgress}%`} />
        </div>
      </div>

      {/* DM1.73 (Wave C, C3): "what changed here" — the dashboard's delta feed scoped
          to this portfolio's projects. Reuses ChangedSection so both surfaces render
          the same items the same way. */}
      {section && sectionRows.length > 0 && <ChangedSection delta={delta} />}

      {blocking.length > 0 && (
        <div className="rounded-[10px] border border-ink-4 bg-card p-[16px_18px]">
          <div className="mb-2">
            <div className="text-[13px] font-semibold text-foreground">What&apos;s blocking what</div>
            <div className="text-[11px] text-ink-3">Live cross-project dependencies — reddest upstream first (docs/26 §6)</div>
          </div>
          <div className="flex flex-col">
            {blocking.map((e) => (
              <div key={`${e.projectId}:${e.waitsOnId}`} className="flex flex-wrap items-center gap-2 border-b border-[var(--w06)] py-1.5 text-xs last:border-0">
                <span className="font-semibold text-foreground">{e.projectCode}</span>
                <span className="text-ink-3">waits on</span>
                <span
                  className="size-2 flex-none rounded-full"
                  style={{ background: e.waitsOnRag === "Red" ? "var(--bad)" : e.waitsOnRag === "Amber" ? "var(--warn)" : "var(--ok)" }}
                />
                <span className="font-semibold text-foreground">{e.waitsOnCode} · {e.waitsOnName}</span>
                <span className="text-ink-3">({e.waitsOnStatus})</span>
                {e.note && <span className="text-[10.5px] italic text-ink-3">— {e.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {portfolio.programmes.length > 0 && (
        <div>
          <div className="mb-3">
            <div className="text-[13px] font-semibold text-foreground">Programmes</div>
            <div className="text-[11px] text-ink-3">Click a programme to expand its projects</div>
          </div>
          <div className="flex flex-col gap-3">
            {portfolio.programmes.map((programme) => (
              <ProgrammeCard key={programme.id} programme={programme} highlightSub={sub} />
            ))}
          </div>
        </div>
      )}

      {portfolio.standaloneInPortfolio.length > 0 && (
        <div>
          <div className="mb-3">
            <div className="text-[13px] font-semibold text-foreground">
              Standalone Projects in this Portfolio
            </div>
            <div className="text-[11px] text-ink-3">Not part of a programme</div>
          </div>
          <StandaloneCardGrid items={portfolio.standaloneInPortfolio} />
        </div>
      )}

      {portfolio.programmes.length === 0 && portfolio.standaloneInPortfolio.length === 0 && (
        <EmptyState message="No programmes or projects in this portfolio yet." />
      )}
    </div>
  );
}

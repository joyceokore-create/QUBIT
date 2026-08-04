import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getPortfolioDetail } from "@/server/projects";
import { blockingMap } from "@/server/project-dependencies";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { ProgrammeCard } from "@/components/portfolios/programme-card";
import { StandaloneCardGrid } from "@/components/dashboard/standalone-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import Link from "next/link";
import { Plus } from "lucide-react";
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
  const portfolio = await getPortfolioDetail(ctx, id);
  if (!portfolio) notFound();
  // M-P2c (docs/33) — the "what's blocking what" panel, scoped to this portfolio.
  const blocking = (await blockingMap(ctx)).find((g) => g.portfolioId === id)?.edges ?? [];

  const canCreate = can(ctx, "project:create");
  const canCreateProgramme = can(ctx, "programme:create");

  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <Breadcrumb items={[{ label: "Group Overview", href: "/dashboard" }, { label: portfolio.name }]} />

      <div className="rounded-[10px] border border-ink-4 bg-card p-[20px_22px]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="font-heading text-lg rv:text-heading-md font-bold tracking-[-0.3px] text-foreground">
              {portfolio.name}
            </div>
            {portfolio.description && (
              <div className="mt-[3px] max-w-[560px] text-xs rv:text-body-sm text-ink-3">{portfolio.description}</div>
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
        <div className="flex flex-wrap gap-6">
          <HeaderStat label="Total Items" value={portfolio.itemCount} />
          <HeaderStat label="On Track" value={portfolio.onTrack} className="text-status-green" />
          <HeaderStat label="At Risk" value={portfolio.atRisk} className="text-amber" />
          <HeaderStat label="Overdue" value={portfolio.overdue} className="text-status-red" />
          <HeaderStat label="Avg Progress" value={`${portfolio.avgProgress}%`} />
          <HeaderStat label="Budget" value={portfolio.budget ?? "—"} className="text-[16px]" />
        </div>
      </div>

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

import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { flagEnabled } from "@/lib/flags";
import { withTenant } from "@/lib/tenant";
import { getIdeaForPrefill } from "@/server/ideas";
import { listMarkets } from "@/server/portfolios";
import { listWorkload } from "@/server/resources";
import { Forbidden } from "@/components/forbidden";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { ProjectWizard } from "./project-wizard";

// M-P1c (docs/26 §5.3) — the centrepiece wizard: seven questions, one per screen.
export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string; fromIdea?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!can(ctx, "project:create")) return <Forbidden />;
  const { portfolio: preselectedPortfolioId, fromIdea } = await searchParams;
  // M-P4a — accepting an idea opens this wizard pre-filled. getIdeaForPrefill returns
  // null unless the viewer may triage AND the idea is still open, so a stale or forged
  // ?fromIdea= simply yields the ordinary blank wizard.
  const idea = fromIdea ? await getIdeaForPrefill(ctx, fromIdea) : null;

  const [data, markets, workload] = await Promise.all([
    withTenant(ctx, async (tx) => ({
      portfolios: await tx.portfolio.findMany({
        select: { id: true, name: true, category: true, defaultMarkets: true },
        orderBy: { name: "asc" },
      }),
      programmes: await tx.programme.findMany({
        select: { id: true, name: true, portfolioId: true },
        orderBy: { name: "asc" },
      }),
      templates: await tx.checkpointTemplate.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          checkpoints: { select: { name: true }, orderBy: { orderIndex: "asc" } },
        },
        orderBy: { name: "asc" },
      }),
      teamTemplates: await tx.teamTemplate.findMany({
        select: { id: true, name: true, shape: true },
        orderBy: { name: "asc" },
      }),
    })),
    listMarkets(ctx),
    listWorkload(ctx),
  ]);

  return (
    <div className="mx-auto w-full max-w-[980px] px-6 py-6">
      <Breadcrumb items={[{ label: "Projects", href: "/projects" }, { label: "New project" }]} />
      <h1 className="mt-2 text-[20px] font-bold tracking-[-0.4px] text-[var(--qink)]">New project</h1>
      <p className="mb-5 text-[12.5px] text-[var(--ink3)]">
        {idea ? (
          <>
            Pre-filled from the idea <b>“{idea.title}”</b> — sponsored by {idea.sponsor}. Creating the project accepts
            the idea.
          </>
        ) : (
          "The centrepiece wizard — seven questions, one per screen."
        )}
      </p>
      <ProjectWizard
        userId={ctx.userId}
        portfolios={data.portfolios.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          defaultMarkets: Array.isArray(p.defaultMarkets) ? (p.defaultMarkets as string[]) : [],
        }))}
        programmes={data.programmes}
        templates={data.templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          gates: t.checkpoints.map((c) => c.name),
        }))}
        teamTemplates={data.teamTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          shape: (t.shape as { role: string; allocationPct: number }[]) ?? [],
        }))}
        markets={markets}
        people={workload.map((w) => ({
          userId: w.userId,
          name: w.name,
          totalPct: w.totalPct,
          effectivePct: w.effectivePct,
          onLeaveUntil: w.onLeaveUntil ? w.onLeaveUntil.toISOString() : null,
        }))}
        preselectedPortfolioId={preselectedPortfolioId ?? idea?.suggestedPortfolioId ?? null}
        fromIdea={idea ? { id: idea.id, title: idea.title, problem: idea.problem } : null}
        youtrackEnabled={flagEnabled("youtrack")}
      />
    </div>
  );
}

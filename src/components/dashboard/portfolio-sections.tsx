import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { PortfolioSection, PortfolioSectionsData } from "@/server/pipeline";
import type { RolloutMatrix } from "@/server/rollout";
import { PipelineTable } from "@/components/dashboard/pipeline-table";
import { RolloutHeatmap } from "@/components/dashboard/rollout-heatmap";
import { CARD } from "@/components/dashboard/presets/v2-sections";

// Portfolio sections (docs/18 §6 amended, shape per the supervisor's wireframe): one
// collapsible <details> per portfolio, worst health first, Unassigned last and only
// when non-empty. Collapsed shows just the header row, so the whole book scans in one
// screen. Sections with trouble open by default; Green ones start collapsed (DM1.30).
// Body = the viewKind lens: Pipeline renders the stage-grouped table, Rollout renders
// the project × market heatmap (M-D-B). A Rollout portfolio with no market tracks yet
// falls back to the pipeline lens rather than showing an empty grid.

const RAG_TOKEN: Record<string, string> = { Green: "--ok", Amber: "--warn", Red: "--bad" };

function SectionDelta({ delta }: { delta: -1 | 0 | 1 | null }) {
  if (delta === null) return null;
  if (delta > 0) return <ArrowUpRight className="size-3 text-[var(--bad)]" aria-label="worsened vs last week" />;
  if (delta < 0) return <ArrowDownRight className="size-3 text-[var(--ok)]" aria-label="improved vs last week" />;
  return <Minus className="size-3 text-[var(--ink5)] opacity-60" aria-label="unchanged vs last week" />;
}

function Section({
  section,
  scope,
  matrix,
}: {
  section: PortfolioSection;
  scope: "all" | "mine";
  matrix?: RolloutMatrix;
}) {
  const tok = RAG_TOKEN[section.rag];
  // Only use the rollout lens when there is something to show in it.
  const showRollout = section.viewKind === "Rollout" && !!matrix && matrix.rows.length > 0 && matrix.markets.length > 0;
  return (
    <details className={`${CARD} group overflow-hidden`} style={{ background: "var(--cardbg)" }} open={section.rag !== "Green"}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2.5 p-[11px_16px]">
        <span className="font-mono text-[10px] text-[var(--ink5)] transition-transform group-open:rotate-90">▶</span>
        <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">{section.name}</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-[6px] border px-1.5 py-0.5 font-mono text-[9px] font-bold"
          style={{ color: `var(${tok})`, borderColor: `color-mix(in oklab, var(${tok}) 35%, transparent)`, background: `color-mix(in oklab, var(${tok}) 9%, transparent)` }}
        >
          <span className="size-1.5 rounded-full" style={{ background: `var(${tok})` }} />
          {section.rag.toUpperCase()}
        </span>
        <SectionDelta delta={section.ragDelta} />
        <span className="ml-auto flex items-center gap-3 font-mono text-[9.5px] uppercase tracking-[.8px] text-[var(--ink4)]">
          <span>{section.projectCount} project{section.projectCount === 1 ? "" : "s"}</span>
          <span className="tabular-nums">{section.progress}%</span>
          {section.openBlockers > 0 && <span className="text-[var(--bad)]">{section.openBlockers} blocked</span>}
          {section.ownerName && <span className="hidden md:inline">{section.ownerName}</span>}
          {section.viewKind === "Rollout" && (
            <span className="text-[var(--qinfo)]">{showRollout ? "ROLLOUT" : "ROLLOUT · NO MARKET TRACKS YET"}</span>
          )}
        </span>
      </summary>
      <div className="border-t border-[var(--hair)]">
        {section.projectCount === 0 ? (
          <p className="p-[12px_16px] text-[12px] text-[var(--ink5)]">No active projects in this portfolio.</p>
        ) : showRollout ? (
          <RolloutHeatmap matrix={matrix!} />
        ) : (
          <PipelineTable data={section.pipeline} scope={scope} bare />
        )}
      </div>
    </details>
  );
}

export function PortfolioSections({
  data,
  scope = "all",
  matrices = [],
}: {
  data: PortfolioSectionsData;
  scope?: "all" | "mine";
  /** Rollout matrices keyed by portfolio (docs/18 §6) — absent ones fall back to pipeline. */
  matrices?: RolloutMatrix[];
}) {
  // Scoped views (PM/dev "mine") drop sections holding none of the viewer's projects —
  // still a filter, never a wall: the ALL toggle restores the whole book (DM1.20).
  const sections =
    scope === "mine" ? data.sections.filter((s) => s.pipeline.groups.some((g) => g.rows.some((r) => r.isMine))) : data.sections;

  if (sections.length === 0) {
    return (
      <div className={`${CARD} p-4 text-[12px] text-[var(--ink5)]`} style={{ background: "var(--cardbg)" }}>
        {scope === "mine" ? "None of your projects yet — flip to All, or take one on." : "No portfolios."}
      </div>
    );
  }
  const matrixByPortfolio = new Map(matrices.map((m) => [m.portfolioId, m]));
  return (
    <section className="flex flex-col gap-2.5">
      {sections.map((s) => (
        <Section key={s.id} section={s} scope={scope} matrix={matrixByPortfolio.get(s.id)} />
      ))}
    </section>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { canViewProject } from "@/lib/project-access";
import { canWriteProject } from "@/lib/access";
import { getMarketTrack } from "@/server/rollout";
import { Forbidden } from "@/components/forbidden";
import { MarketCheckInCard } from "@/components/workspace/market-checkin-card";
import { CARD } from "@/lib/surface";

// One project × market track (docs/18 §3.1 drill-down): the gate matrix for this market
// plus the week's focus & blockers — the "Where We Are" + "Critical Focus" slides as one
// live page. Reached by clicking a cell on the rollout heatmap.

// One shared presentation map (DM1.73) — the raw enum is never shown.
import { CHECKPOINT_STATE_TOK as STATE_TOK, CHECKPOINT_STATE_LABEL as STATE_LABEL } from "@/lib/checkpoint-view";

export default async function MarketTrackPage({
  params,
}: {
  params: Promise<{ id: string; orgUnitId: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  const { id, orgUnitId } = await params;

  if (!(await canViewProject(ctx, id))) return <Forbidden />;
  const track = await getMarketTrack(ctx, id, orgUnitId);
  if (!track) notFound();

  const canGovern = can(ctx, "project:stage") || (await canWriteProject(ctx, id));

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-3.5 p-[22px_24px_90px]">
      <div>
        <Link
          href={`/projects/${track.projectId}`}
          className="mb-1.5 flex w-fit items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[.8px] text-[var(--ink4)] hover:text-[var(--qink)]"
        >
          <ArrowLeft className="size-3" /> {track.projectCode} · {track.projectName}
        </Link>
        <h1 className="font-heading text-[24px] font-bold tracking-[-.6px] text-[var(--qink)]">
          {`${track.market.flag ?? ""} ${track.market.name}`.trim()}
        </h1>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[1.2px] text-[var(--ink4)]">
          Market track · {track.progress}% derived
        </p>
      </div>

      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className={CARD} style={{ background: "var(--cardbg)" }}>
          <div className="flex items-baseline gap-2.5 border-b border-[var(--hair)] p-[12px_16px]">
            <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">Checkpoints in this market</span>
            <span className="font-mono text-[9px] tabular-nums text-[var(--ink4)]">{track.progress}%</span>
          </div>
          {track.rows.length === 0 ? (
            <p className="p-[12px_16px] text-[12px] text-[var(--ink5)]">
              This project has no checkpoint template yet — attach one on the project workspace and the gates appear here.
            </p>
          ) : (
            <ol className="flex flex-col">
              {track.rows.map((row) => (
                <li key={row.checkpointId} className="flex items-center gap-2.5 border-b border-[var(--hair2)] p-[9px_16px] last:border-0">
                  <span className="size-2 flex-none rounded-full" style={{ background: `var(${STATE_TOK[row.state]})` }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink2)]">{row.name}</span>
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[.6px]" style={{ color: `var(${STATE_TOK[row.state]})` }}>
                    {STATE_LABEL[row.state] ?? row.state}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <MarketCheckInCard
          projectId={track.projectId}
          orgUnitId={track.market.id}
          initial={track.checkIn}
          canGovern={canGovern}
        />
      </section>
    </main>
  );
}

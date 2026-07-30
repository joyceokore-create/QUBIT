import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { isoWeekId } from "@/lib/iso-week";
import { emitDomainEvent } from "@/server/events";
import { projectRag, ragRank, worstStatus, type Rag } from "@/server/health";
import { derivedProgress, type CheckpointState } from "@/server/checkpoints";

/**
 * Rollout lens (docs/18 §3 + §6). For a `viewKind = Rollout` portfolio the body is a
 * project × market heatmap: rows are the portfolio's child projects/modules, columns
 * are the tenant's Market org units, and a cell is that project's track in that market.
 *
 * Roll-ups are derived bottom-up through the ONE health engine (§3.0): market-track RAG
 * → project RAG → portfolio RAG (worst-of). A cell's % is derived from its own
 * CheckpointStatus rows; a cell with no track at all renders as "—", never as 0%.
 * Per §2's one-encoding rule the cell shows RAG + Δ only; counts live in the tooltip.
 */

export const MARKET_RAGS = ["Green", "Amber", "Red"] as const;

export interface RolloutCell {
  orgUnitId: string;
  /** null when this project has no track in this market — rendered "—", not 0%. */
  progress: number | null;
  rag: Rag | null;
  /** RAG movement vs ~7 days ago: -1 improved · 0 flat · 1 worsened; null without history. */
  delta: -1 | 0 | 1 | null;
  gatesDone: number;
  gatesTotal: number;
  /** This week's market check-in narrative, when one exists. */
  narrative: string | null;
}

export interface RolloutRow {
  projectId: string;
  code: string;
  name: string;
  rag: Rag;
  progress: number;
  cells: RolloutCell[];
}

export interface RolloutBlocker {
  id: string;
  description: string;
  severity: string;
  projectCode: string;
  marketCode: string | null;
  ageDays: number;
}

export interface RolloutMatrix {
  portfolioId: string;
  portfolioName: string;
  markets: { id: string; code: string; name: string; flag: string | null }[];
  rows: RolloutRow[];
  /** The portfolio summary row (§3.1) — derived, per market. */
  summary: { orgUnitId: string; progress: number | null; rag: Rag | null }[];
  /** Top open blockers across the portfolio's rollout projects (§6 strip). */
  topBlockers: RolloutBlocker[];
}

const day = 86_400_000;

/** Build the project × market matrix for one Rollout portfolio. */
export async function getRolloutMatrix(
  ctx: TenantContext,
  portfolioId: string,
  now = new Date(),
): Promise<RolloutMatrix | null> {
  const isoWeek = isoWeekId(now);

  return withTenant(ctx, async (tx) => {
    const portfolio = await tx.portfolio.findUnique({ where: { id: portfolioId }, select: { id: true, name: true } });
    if (!portfolio) return null;

    const [markets, projects] = await Promise.all([
      tx.orgUnit.findMany({
        where: { kind: "Market" },
        select: { id: true, code: true, name: true, flag: true },
        orderBy: { createdAt: "asc" },
      }),
      tx.project.findMany({
        where: { portfolioId, status: { notIn: ["Completed", "Cancelled"] } },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          checkpointTemplate: { select: { _count: { select: { checkpoints: true } } } },
        },
        orderBy: { name: "asc" },
      }),
    ]);
    if (!projects.length) {
      return { portfolioId: portfolio.id, portfolioName: portfolio.name, markets, rows: [], summary: [], topBlockers: [] };
    }

    const projectIds = projects.map((p) => p.id);
    const [statuses, checkIns, orgStatuses, weekAgoSnaps, blockers] = await Promise.all([
      // Market tracks only: orgUnitId NOT null (the project's own track is the pipeline lens).
      tx.checkpointStatus.findMany({
        where: { projectId: { in: projectIds }, orgUnitId: { not: null } },
        select: { projectId: true, orgUnitId: true, state: true },
      }),
      tx.marketCheckIn.findMany({
        where: { projectId: { in: projectIds }, isoWeek },
        select: { projectId: true, orgUnitId: true, narrative: true, rag: true },
      }),
      // A track EXISTS when there is a ProjectOrgStatus row for that project × market —
      // that is the market-track model (§3.1), reused rather than duplicated.
      tx.projectOrgStatus.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, orgUnitId: true, status: true, progress: true },
      }),
      tx.projectSnapshot.findMany({
        where: {
          projectId: { in: projectIds },
          day: { lte: new Date(now.getTime() - 6 * day), gte: new Date(now.getTime() - 10 * day) },
        },
        orderBy: { day: "desc" },
        select: { projectId: true, status: true },
      }),
      tx.blocker.findMany({
        where: { projectId: { in: projectIds }, status: "Open" },
        select: { id: true, description: true, severity: true, projectId: true, dateRaised: true },
        orderBy: { dateRaised: "asc" },
        take: 5,
      }),
    ]);

    const marketIds = new Set(markets.map((m) => m.id));
    const statesByCell = new Map<string, CheckpointState[]>();
    for (const s of statuses) {
      if (!s.orgUnitId || !marketIds.has(s.orgUnitId)) continue;
      const key = `${s.projectId}:${s.orgUnitId}`;
      const list = statesByCell.get(key) ?? [];
      list.push(s.state as CheckpointState);
      statesByCell.set(key, list);
    }
    const checkInByCell = new Map(checkIns.map((c) => [`${c.projectId}:${c.orgUnitId}`, c]));
    const trackByCell = new Map(orgStatuses.map((o) => [`${o.projectId}:${o.orgUnitId}`, o]));
    const lastWeekStatus = new Map<string, string>();
    for (const s of weekAgoSnaps) if (!lastWeekStatus.has(s.projectId)) lastWeekStatus.set(s.projectId, s.status);

    const codeById = new Map(projects.map((p) => [p.id, p.code]));

    const rows: RolloutRow[] = projects.map((p) => {
      const gatesTotal = p.checkpointTemplate?._count.checkpoints ?? 0;
      const cells: RolloutCell[] = markets.map((m) => {
        const key = `${p.id}:${m.id}`;
        const track = trackByCell.get(key);
        const states = statesByCell.get(key) ?? [];
        // No track and no gate state → this project simply doesn't ship here.
        if (!track && !states.length) {
          return { orgUnitId: m.id, progress: null, rag: null, delta: null, gatesDone: 0, gatesTotal, narrative: null };
        }
        const checkIn = checkInByCell.get(key);
        const padded: CheckpointState[] = gatesTotal
          ? [...states, ...Array<CheckpointState>(Math.max(0, gatesTotal - states.length)).fill("NotStarted")].slice(0, gatesTotal)
          : states;
        // % prefers derived gate state; a track with no gates keeps its stored progress.
        const progress = padded.length ? derivedProgress(padded) : (track?.progress ?? 0);
        // RAG prefers the human's market check-in this week, else the track's status.
        const rag: Rag = checkIn ? (checkIn.rag as Rag) : projectRag(track?.status ?? p.status);
        const prev = lastWeekStatus.get(p.id);
        const delta = prev ? (Math.sign(ragRank(track?.status ?? p.status) - ragRank(prev)) as -1 | 0 | 1) : null;
        return {
          orgUnitId: m.id,
          progress,
          rag,
          delta,
          gatesDone: padded.filter((s) => s === "Done").length,
          gatesTotal: padded.length,
          narrative: checkIn?.narrative ?? null,
        };
      });
      const live = cells.filter((c) => c.rag !== null);
      return {
        projectId: p.id,
        code: p.code,
        name: p.name,
        // Project RAG = worst of its market tracks, else its own status (§3.0 bottom-up).
        rag: live.length ? worstRag(live.map((c) => c.rag!)) : projectRag(p.status),
        progress: live.length ? Math.round(live.reduce((a, c) => a + (c.progress ?? 0), 0) / live.length) : 0,
        cells,
      };
    });

    const summary = markets.map((m, i) => {
      const column = rows.map((r) => r.cells[i]).filter((c) => c.rag !== null);
      if (!column.length) return { orgUnitId: m.id, progress: null, rag: null };
      return {
        orgUnitId: m.id,
        progress: Math.round(column.reduce((a, c) => a + (c.progress ?? 0), 0) / column.length),
        rag: worstRag(column.map((c) => c.rag!)),
      };
    });

    const topBlockers: RolloutBlocker[] = blockers.map((b) => ({
      id: b.id,
      description: b.description,
      severity: b.severity,
      projectCode: codeById.get(b.projectId) ?? "",
      marketCode: null, // blockers are project-scoped today; per-market linkage is future work
      ageDays: Math.max(0, Math.floor((now.getTime() - b.dateRaised.getTime()) / day)),
    }));

    return { portfolioId: portfolio.id, portfolioName: portfolio.name, markets, rows, summary, topBlockers };
  });
}

/** Every Rollout portfolio's matrix — what the dashboard and the Reports page both
 * render, so the two can never disagree (docs/18 §6). */
export async function getRolloutMatrices(ctx: TenantContext, now = new Date()): Promise<RolloutMatrix[]> {
  const ids = await withTenant(ctx, async (tx) => {
    const rows = await tx.portfolio.findMany({ where: { viewKind: "Rollout" }, select: { id: true } });
    return rows.map((r) => r.id);
  });
  const matrices = await Promise.all(ids.map((id) => getRolloutMatrix(ctx, id, now)));
  return matrices.filter((m): m is RolloutMatrix => m !== null);
}

/** Worst-of across RAGs, routed through the health engine's own ranking. */
function worstRag(rags: Rag[]): Rag {
  const RAG_TO_STATUS: Record<Rag, string> = { Green: "OnTrack", Amber: "AtRisk", Red: "Overdue" };
  return projectRag(worstStatus(rags.map((r) => RAG_TO_STATUS[r])));
}

export interface MarketTrackDetail {
  projectId: string;
  projectCode: string;
  projectName: string;
  market: { id: string; code: string; name: string; flag: string | null };
  progress: number;
  rows: { checkpointId: string; name: string; state: CheckpointState }[];
  checkIn: { narrative: string; rag: string; isoWeek: string } | null;
}

/** One project × market track: its checkpoint matrix + this week's focus & blockers. */
export async function getMarketTrack(
  ctx: TenantContext,
  projectId: string,
  orgUnitId: string,
  now = new Date(),
): Promise<MarketTrackDetail | null> {
  const isoWeek = isoWeekId(now);
  return withTenant(ctx, async (tx) => {
    const [project, market] = await Promise.all([
      tx.project.findUnique({
        where: { id: projectId },
        select: {
          id: true, code: true, name: true,
          checkpointTemplate: { select: { checkpoints: { select: { id: true, name: true }, orderBy: { orderIndex: "asc" } } } },
        },
      }),
      tx.orgUnit.findFirst({ where: { id: orgUnitId, kind: "Market" }, select: { id: true, code: true, name: true, flag: true } }),
    ]);
    if (!project || !market) return null;

    const [statuses, checkIn] = await Promise.all([
      tx.checkpointStatus.findMany({
        where: { projectId, orgUnitId },
        select: { checkpointId: true, state: true },
      }),
      tx.marketCheckIn.findUnique({
        where: { projectId_orgUnitId_isoWeek: { projectId, orgUnitId, isoWeek } },
        select: { narrative: true, rag: true, isoWeek: true },
      }),
    ]);
    const stateFor = new Map(statuses.map((s) => [s.checkpointId, s.state as CheckpointState]));
    const rows = (project.checkpointTemplate?.checkpoints ?? []).map((c) => ({
      checkpointId: c.id,
      name: c.name,
      state: stateFor.get(c.id) ?? ("NotStarted" as CheckpointState),
    }));
    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      market,
      progress: derivedProgress(rows.map((r) => r.state)),
      rows,
      checkIn,
    };
  });
}

export const MarketCheckInInput = z.object({
  narrative: z.string().trim().min(1, "Say what the focus and blockers are.").max(1000),
  rag: z.enum(MARKET_RAGS),
});
export type MarketCheckInInputT = z.infer<typeof MarketCheckInInput>;

/** Write this week's market check-in. Caller holds the governance gate (route-enforced). */
export async function saveMarketCheckIn(
  ctx: TenantContext,
  projectId: string,
  orgUnitId: string,
  input: MarketCheckInInputT,
  now = new Date(),
): Promise<void> {
  const isoWeek = isoWeekId(now);
  await withTenant(ctx, async (tx) => {
    const market = await tx.orgUnit.findFirst({ where: { id: orgUnitId, kind: "Market" }, select: { id: true, code: true } });
    if (!market) throw new Error("Market not found.");

    const data = { narrative: input.narrative, rag: input.rag, authorId: ctx.userId };
    const row = await tx.marketCheckIn.upsert({
      where: { projectId_orgUnitId_isoWeek: { projectId, orgUnitId, isoWeek } },
      create: { tenantId: ctx.tenantId, projectId, orgUnitId, isoWeek, ...data },
      update: data,
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "market_check_in",
      entityId: row.id,
      after: { isoWeek, market: market.code, rag: input.rag },
    });
    await emitDomainEvent(tx, ctx, {
      type: "market_checkin.saved",
      entityType: "market_check_in",
      entityId: row.id,
      payload: { projectId, orgUnitId, isoWeek, rag: input.rag },
    });
  });
}

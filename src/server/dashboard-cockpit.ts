import { withTenant, type TenantContext } from "@/lib/tenant";
import { pmIdsOf } from "@/lib/ownership";
import { isoWeekId, isoWeekMonday, shiftIsoWeek, weekWindow } from "@/lib/iso-week";
import { projectRag, type Rag } from "@/server/health";
import { effectiveRag } from "@/server/checkins";
import type { CheckpointState } from "@/lib/checkpoint-progress";
import { gateTrackOf, type GateMap } from "@/lib/cockpit-gates";
import { requirementCoveragePct } from "@/server/dashboard-qa";
import { deriveDimensions, ragPair, isDispute, type DimensionMap, type DimRag } from "@/server/rag-dimensions";

// One assembler for the whole Delivery Cockpit. It loads every tenant project once (RLS-scoped)
// with just the relations the cockpit needs, then derives the reference model's per-project
// shape: reported vs calculated RAG, the six derived dimensions, gate progress, freshness, next
// milestone, risks and the rollout matrix. Each level preset consumes the same CockpitProject[]
// and aggregates it differently, exactly as the reference's PM/Head/Exec views do.
//
// UX1 (2026-11-10) — reconnected to the engines every other surface already uses, so the
// cockpit can never disagree with the estate, the workspace or the reports:
//  - gates are the project's REAL checkpoint states (per market too), not a guess from %;
//  - % complete is checkpointProgressByProject's derived number when the project is gated;
//  - "reported" is the estate's display RAG: the week's check-in (override-aware), else the
//    typed status — the value rag-parity-chain.test.ts pins across the reporting chain;
//  - requirement coverage is the QA dashboard's traceability rule;
//  - the trend counts one weekly check-in per project per week (as the Reports grid does),
//    not every nightly snapshot.

const OPEN_BLOCKER = { status: "Open" as const };
const RED_ISSUE_SEV = ["High", "Critical"];

// Gate columns, the state → cell mapping and stageOf are pure and live in src/lib so the
// cockpit's client components can import them without server code (UX1).
export {
  COCKPIT_PHASES,
  GATE_KEYS,
  GATE_LABELS,
  gateKeyOf,
  gateTrackOf,
  stageOf,
  type GateKey,
  type GateMap,
  type GateState,
  type GateTrack,
} from "@/lib/cockpit-gates";

export interface CockpitRisk {
  id: string;
  title: string;
  severity: DimRag; // R | A
  owner: string;
}

export interface CockpitMarket {
  market: string;
  pct: number;
  status: string;
  gates: GateMap;
}

export interface CockpitProject {
  id: string;
  code: string;
  name: string;
  desc: string;
  category: string; // portfolio category: Approved | Exploring | Shelved | (Unfiled)
  portfolioName: string | null;
  /** The lead, or the first "Project Manager" member when no lead is set. */
  pmId: string | null;
  pmName: string | null;
  /** Everyone who runs the project: the lead plus "Project Manager" members. */
  pmIds: string[];
  status: string; // raw delivery status
  priority: string; // High | Med | Low | New | Strat | Paused
  /** The estate's display RAG: this week's check-in (override-aware), else the typed status. */
  reported: DimRag;
  /** True when `reported` is the PM's confirmed check-in for this week. */
  reportedConfirmed: boolean;
  calculated: DimRag;
  dispute: boolean;
  dims: DimensionMap;
  pct: number;
  dueDate: Date | null;
  targetPassed: boolean;
  freshnessDays: number; // days since the latest check-in / status update (999 = never)
  nextMilestone: { name: string; dueDate: Date | null; overdue: boolean } | null;
  openBlockers: number;
  openRisks: number;
  redRisks: number;
  overdueTasks: number;
  gates: GateMap;
  /** First gate not yet Done on the project's own track; "Complete"; null = no template. */
  currentGate: string | null;
  /** The project's template is the "Product build" shape the gate columns show. */
  buildTrack: boolean;
  /** Requirement coverage percent (QA traceability rule); null = no requirements. */
  coveragePct: number | null;
  risks: CockpitRisk[];
  markets: CockpitMarket[];
  update: string | null; // latest narrative (status note)
  hasBudget: boolean;
}

export interface CockpitData {
  projects: CockpitProject[];
  /** distinct PMs (project leads) with their project ids, for the Head roll-up. */
  pms: { id: string; name: string; projectIds: string[] }[];
  /** Weekly status trend: per ISO week, [Green, Amber, Red] counts of that week's check-ins
   * (one per project, override-aware at the week's end). Empty until check-ins exist. */
  trend: { weeks: string[]; series: [number, number, number][] };
  /** The same weeks read from each check-in's COMPUTED RAG (signals, before any override). */
  trendComputed: { weeks: string[]; series: [number, number, number][] };
  generatedAt: Date;
}

interface TrendCheckIn {
  isoWeek: string;
  status: string;
  computedRag: string;
  ragOverride: string | null;
  overrideExpiresAt: Date | null;
}

/** The instant a week's RAG is read at: now for the current week, else that week's end —
 * so a signed override still reads as signed after its 7-day expiry (reports-week rule). */
function evalAt(isoWeek: string, now: Date): Date {
  const end = weekWindow(isoWeekMonday(isoWeek)).end;
  return now < end ? now : end;
}

/** Pure: the `weeks` ISO weeks ending this week, each counting one check-in per project. */
export function trendFromCheckIns(
  checkIns: TrendCheckIn[],
  now: Date,
  weeks: number,
  read: "effective" | "computed" = "effective",
): CockpitData["trend"] {
  const current = isoWeekId(now);
  const ids = Array.from({ length: weeks }, (_, i) => shiftIsoWeek(current, i - (weeks - 1)));
  const index = new Map(ids.map((w, i) => [w, i]));
  const series = ids.map(() => [0, 0, 0] as [number, number, number]);
  for (const ci of checkIns) {
    const i = index.get(ci.isoWeek);
    if (i === undefined) continue;
    const rag = read === "computed" ? (ci.computedRag as Rag) : effectiveRag(ci, evalAt(ci.isoWeek, now));
    series[i]![rag === "Green" ? 0 : rag === "Amber" ? 1 : 2]++;
  }
  if (!series.some((s) => s[0] + s[1] + s[2] > 0)) return { weeks: [], series: [] };
  const label = (w: string) => isoWeekMonday(w).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return { weeks: ids.map(label), series };
}

// Period → trend window (weeks). "4w" · "8w" (default) · "13w" (quarter).
export const PERIOD_WEEKS: Record<string, number> = { "4w": 4, "8w": 8, "13w": 13 };

const short: Record<Rag, DimRag> = { Green: "G", Amber: "A", Red: "R" };
const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000);

export async function getCockpitData(ctx: TenantContext, now = new Date(), trendWeeks = 8): Promise<CockpitData> {
  const thisWeek = isoWeekId(now);
  const trendWeekIds = Array.from({ length: trendWeeks }, (_, i) => shiftIsoWeek(thisWeek, i - (trendWeeks - 1)));
  const { rows, userNames, lastCheckIn } = await withTenant(ctx, async (tx) => {
    const users = await tx.user.findMany({ select: { id: true, name: true } });
    const latest = await tx.checkIn.groupBy({ by: ["projectId"], _max: { createdAt: true } });
    const projectRows = await tx.project.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        objective: true,
        status: true,
        priority: true,
        statusNote: true,
        dueDate: true,
        budget: true,
        leadUserId: true,
        lead: { select: { name: true } },
        members: { where: { role: "Project Manager" }, select: { userId: true, user: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
        pmScope: true,
        portfolio: { select: { name: true, category: true } },
        orgStatuses: { where: { retiredAt: null }, select: { orgUnitId: true, progress: true, status: true, leadUserId: true, orgUnit: { select: { name: true } } } },
        milestonesV2: {
          where: { status: "Pending" },
          orderBy: { dueDate: "asc" },
          select: { name: true, dueDate: true },
        },
        risks: { where: { status: "Open" }, select: { id: true, title: true, ownerId: true } },
        issues: { where: { status: "Open" }, select: { id: true, title: true, severity: true, ownerId: true } },
        requirements: { where: { status: "Accepted" }, select: { taskLinks: { select: { task: { select: { approvalStatus: true } } } } } },
        // The trend window's check-ins; the current week's one is also the reported RAG.
        checkIns: {
          where: { isoWeek: { in: trendWeekIds } },
          select: { isoWeek: true, status: true, computedRag: true, ragOverride: true, overrideExpiresAt: true },
        },
        statusUpdates: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        checkpointTemplate: { select: { checkpoints: { select: { id: true, name: true }, orderBy: { orderIndex: "asc" } } } },
        // The project's own track (orgUnitId null) and each market's (orgUnitId set).
        checkpointStatuses: { where: { moduleId: null }, select: { checkpointId: true, orgUnitId: true, state: true } },
        _count: {
          select: {
            blockers: { where: OPEN_BLOCKER },
            projectTasks: {
              where: { approvalStatus: "Published", status: { not: "Completed" }, dueDate: { lt: now } },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });
    return {
      rows: projectRows,
      userNames: new Map(users.map((u) => [u.id, u.name])),
      lastCheckIn: new Map(latest.map((l) => [l.projectId, l._max.createdAt])),
    };
  });

  const ownerName = (id: string | null) => (id ? (userNames.get(id) ?? "—") : "—");

  const projects: CockpitProject[] = rows.map((p) => {
    const checkpoints = p.checkpointTemplate?.checkpoints ?? [];
    const statesFor = (orgUnitId: string | null) =>
      new Map(
        p.checkpointStatuses
          .filter((s) => s.orgUnitId === orgUnitId)
          .map((s) => [s.checkpointId, s.state as CheckpointState]),
      );
    const ownStates = statesFor(null);

    const targetPassed = Boolean(
      p.dueDate && p.dueDate < now && p.status !== "Completed" && p.status !== "Cancelled",
    );
    const own = gateTrackOf(checkpoints, ownStates, targetPassed);

    // docs/18 §2 — a gated project's % is derived from its checkpoints (the same number
    // checkpointProgressByProject gives the estate); otherwise the per-market rollup.
    const orgProgress = p.orgStatuses.map((o) => o.progress);
    const pct =
      own.progress ?? (orgProgress.length ? Math.round(orgProgress.reduce((a, b) => a + b, 0) / orgProgress.length) : 0);

    const openBlockers = p._count.blockers;
    const overdueTasks = p._count.projectTasks;
    const gatesBlocked = [...ownStates.values()].filter((s) => s === "Blocked").length;
    const nextMs = p.milestonesV2[0] ?? null;
    const milestonesSlipped = p.milestonesV2.filter((m) => m.dueDate && m.dueDate < now).length;

    const redIssues = p.issues.filter((i) => RED_ISSUE_SEV.includes(i.severity));
    const openRisks = p.risks.length + p.issues.length;
    const redRisks = redIssues.length;

    const signals = { status: p.status, overdueTasks, openBlockers, milestonesSlipped, gatesBlocked };
    const { calculated } = ragPair(signals);
    // T5 — the same display RAG as the estate (pipeline.ts): the week's check-in, else status.
    const weekCheckIn = p.checkIns.find((c) => c.isoWeek === thisWeek);
    const reported = short[weekCheckIn ? effectiveRag(weekCheckIn, now) : projectRag(p.status)];

    const scheduleSlipDays = p.dueDate ? Math.max(0, daysBetween(now, p.dueDate)) : 0;
    const coveragePct = requirementCoveragePct(p.requirements);

    const dims = deriveDimensions({
      status: p.status,
      scheduleSlipDays: targetPassed ? scheduleSlipDays : 0,
      targetPassed,
      openRisks,
      redRisks,
      openBlockers,
      requirementCoverage: coveragePct === null ? null : coveragePct / 100,
      openDefects: null, // no QA defect signal captured on projects yet → "not rated"
      hasBudgetData: Boolean(p.budget),
    });

    const latestActivity = [lastCheckIn.get(p.id), p.statusUpdates[0]?.createdAt]
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const freshnessDays = latestActivity ? Math.max(0, daysBetween(now, latestActivity)) : 999;

    const risks: CockpitRisk[] = [
      ...redIssues.map((i) => ({ id: i.id.slice(0, 8), title: i.title, severity: "R" as DimRag, owner: ownerName(i.ownerId) })),
      ...p.risks.slice(0, 4).map((r) => ({ id: r.id.slice(0, 8), title: r.title, severity: "A" as DimRag, owner: ownerName(r.ownerId) })),
    ].slice(0, 6);

    // docs/38 — each live market's own gate track on the project's template.
    const markets: CockpitMarket[] = p.orgStatuses
      .filter((o) => o.orgUnit)
      .map((o) => {
        const track = gateTrackOf(checkpoints, statesFor(o.orgUnitId), o.status === "Overdue");
        return { market: o.orgUnit!.name, pct: track.progress ?? o.progress, status: o.status, gates: track.gates };
      });

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      desc: p.objective ?? "",
      category: p.portfolio?.category ?? "Unfiled",
      portfolioName: p.portfolio?.name ?? null,
      pmId: p.leadUserId ?? p.members[0]?.userId ?? null,
      pmName: p.lead?.name ?? p.members[0]?.user.name ?? null,
      pmIds: pmIdsOf(p),
      status: p.status,
      priority: p.priority,
      reported,
      reportedConfirmed: weekCheckIn?.status === "Confirmed",
      calculated,
      dispute: isDispute(reported, calculated),
      dims,
      pct,
      dueDate: p.dueDate,
      targetPassed,
      freshnessDays,
      nextMilestone: nextMs
        ? { name: nextMs.name, dueDate: nextMs.dueDate, overdue: Boolean(nextMs.dueDate && nextMs.dueDate < now) }
        : null,
      openBlockers,
      openRisks,
      redRisks,
      overdueTasks,
      gates: own.gates,
      currentGate: own.currentGate,
      buildTrack: own.buildTrack,
      coveragePct,
      risks,
      markets: markets.length > 1 ? markets : [], // a single-market project isn't a rollout
      update: p.statusNote ?? null,
      hasBudget: Boolean(p.budget),
    };
  });

  const pmMap = new Map<string, { id: string; name: string; projectIds: string[] }>();
  for (const p of projects) {
    if (!p.pmId) continue;
    const entry = pmMap.get(p.pmId) ?? { id: p.pmId, name: p.pmName ?? "Unassigned", projectIds: [] };
    entry.projectIds.push(p.id);
    pmMap.set(p.pmId, entry);
  }

  const weekly = rows.flatMap((r) => r.checkIns);
  return {
    projects,
    pms: [...pmMap.values()],
    trend: trendFromCheckIns(weekly, now, trendWeeks),
    trendComputed: trendFromCheckIns(weekly, now, trendWeeks, "computed"),
    generatedAt: now,
  };
}

/** RAG count of a project list by calculated RAG (cockpit tiles/bars). */
export function calcRagCounts(list: CockpitProject[]) {
  return {
    R: list.filter((p) => p.calculated === "R").length,
    A: list.filter((p) => p.calculated === "A").length,
    G: list.filter((p) => p.calculated === "G").length,
    N: list.filter((p) => p.calculated === "N").length,
  };
}

export const CALC_ORDER: Record<DimRag, number> = { R: 0, A: 1, G: 2, N: 3 };
export { short as ragShort };

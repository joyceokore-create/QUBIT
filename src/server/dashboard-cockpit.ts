import { withTenant, type TenantContext } from "@/lib/tenant";
import type { Rag } from "@/server/health";
import { deriveDimensions, ragPair, isDispute, type DimensionMap, type DimRag } from "@/server/rag-dimensions";

// One assembler for the whole Delivery Cockpit. It loads every tenant project once (RLS-scoped)
// with just the relations the cockpit needs, then derives the reference model's per-project
// shape: reported vs calculated RAG, the six derived dimensions, gate progress, freshness, next
// milestone, risks and the rollout matrix. Each level preset consumes the same CockpitProject[]
// and aggregates it differently, exactly as the reference's PM/Head/Exec views do.

const OPEN_BLOCKER = { status: "Open" as const };
const RED_ISSUE_SEV = ["High", "Critical"];

// Fixed delivery gates (the reference's columns). QUBIT's checkpoints are tenant-defined, so
// gate state is DERIVED from overall progress as a monotonic BRD→Go-Live progression — an
// honest approximation that reproduces the reference's gate columns from real % complete.
export type GateState = "done" | "prog" | "late" | "block" | "none";
export const GATE_KEYS = ["brd", "proto", "mvp1", "sit", "uat", "golive"] as const;
export type GateKey = (typeof GATE_KEYS)[number];
export const GATE_LABELS: Record<GateKey, string> = { brd: "BRD", proto: "Proto", mvp1: "MVP1", sit: "SIT", uat: "UAT", golive: "Go-Live" };
const GATE_DONE_AT: Record<GateKey, number> = { brd: 15, proto: 25, mvp1: 45, sit: 65, uat: 85, golive: 100 };
export type GateMap = Record<GateKey, GateState>;

function deriveGates(pct: number, targetPassed: boolean, gatesBlocked: number): GateMap {
  const out = {} as GateMap;
  let currentSet = false;
  for (const k of GATE_KEYS) {
    if (pct >= GATE_DONE_AT[k]) out[k] = "done";
    else if (!currentSet) {
      out[k] = gatesBlocked > 0 ? "block" : targetPassed ? "late" : "prog";
      currentSet = true;
    } else out[k] = "none";
  }
  return out;
}

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
  pmId: string | null;
  pmName: string | null;
  status: string; // raw delivery status
  reported: DimRag;
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
  risks: CockpitRisk[];
  markets: CockpitMarket[];
  update: string | null; // latest narrative (status note)
  hasBudget: boolean;
}

export interface CockpitData {
  projects: CockpitProject[];
  /** distinct PMs (project leads) with their project ids, for the Head roll-up. */
  pms: { id: string; name: string; projectIds: string[] }[];
  /** 8-week RAG trend from nightly ProjectSnapshots (empty until snapshots accrue). */
  trend: { weeks: string[]; series: [number, number, number][] };
  generatedAt: Date;
}

function buildTrend(snaps: { rag: string; createdAt: Date }[], now: Date, weeks: number): CockpitData["trend"] {
  // `weeks` weekly buckets ending this week; each is [Green, Amber, Red] counts.
  const weekMs = 7 * 86_400_000;
  const buckets: { label: string; g: number; a: number; r: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now.getTime() - i * weekMs);
    buckets.push({ label: end.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), g: 0, a: 0, r: 0 });
  }
  const start = now.getTime() - weeks * weekMs;
  for (const s of snaps) {
    const t = s.createdAt.getTime();
    if (t < start) continue;
    const idx = Math.min(weeks - 1, Math.floor((t - start) / weekMs));
    const b = buckets[idx];
    if (!b) continue;
    if (s.rag === "Green") b.g++;
    else if (s.rag === "Amber") b.a++;
    else if (s.rag === "Red") b.r++;
  }
  const hasData = buckets.some((b) => b.g + b.a + b.r > 0);
  if (!hasData) return { weeks: [], series: [] };
  return { weeks: buckets.map((b) => b.label), series: buckets.map((b) => [b.g, b.a, b.r]) };
}

// Period → trend window (weeks). "4w" · "8w" (default) · "13w" (quarter).
export const PERIOD_WEEKS: Record<string, number> = { "4w": 4, "8w": 8, "13w": 13 };

const short: Record<Rag, DimRag> = { Green: "G", Amber: "A", Red: "R" };
const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000);

export async function getCockpitData(ctx: TenantContext, now = new Date(), trendWeeks = 8): Promise<CockpitData> {
  const since = new Date(now.getTime() - trendWeeks * 7 * 86_400_000);
  const { rows, userNames, snaps } = await withTenant(ctx, async (tx) => {
    const users = await tx.user.findMany({ select: { id: true, name: true } });
    const snapRows = await tx.projectSnapshot.findMany({
      where: { createdAt: { gte: since } },
      select: { rag: true, createdAt: true },
    });
    const projectRows = await tx.project.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        objective: true,
        status: true,
        statusNote: true,
        dueDate: true,
        budget: true,
        leadUserId: true,
        lead: { select: { name: true } },
        portfolio: { select: { name: true, category: true } },
        orgStatuses: { select: { progress: true, status: true, orgUnit: { select: { name: true } } } },
        milestonesV2: {
          where: { status: "Pending" },
          orderBy: { dueDate: "asc" },
          select: { name: true, dueDate: true },
        },
        risks: { where: { status: "Open" }, select: { id: true, title: true, ownerId: true } },
        issues: { where: { status: "Open" }, select: { id: true, title: true, severity: true, ownerId: true } },
        requirements: { where: { status: "Accepted" }, select: { id: true } },
        checkIns: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        statusUpdates: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        checkpointStatuses: { where: { orgUnitId: null }, select: { state: true } },
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
    return { rows: projectRows, userNames: new Map(users.map((u) => [u.id, u.name])), snaps: snapRows };
  });

  const ownerName = (id: string | null) => (id ? (userNames.get(id) ?? "—") : "—");

  const projects: CockpitProject[] = rows.map((p) => {
    const orgProgress = p.orgStatuses.map((o) => o.progress);
    const pct = orgProgress.length ? Math.round(orgProgress.reduce((a, b) => a + b, 0) / orgProgress.length) : 0;

    const openBlockers = p._count.blockers;
    const overdueTasks = p._count.projectTasks;
    const gatesBlocked = p.checkpointStatuses.filter((c) => c.state === "Blocked").length;
    const nextMs = p.milestonesV2[0] ?? null;
    const milestonesSlipped = p.milestonesV2.filter((m) => m.dueDate && m.dueDate < now).length;

    const redIssues = p.issues.filter((i) => RED_ISSUE_SEV.includes(i.severity));
    const openRisks = p.risks.length + p.issues.length;
    const redRisks = redIssues.length;

    const signals = { status: p.status, overdueTasks, openBlockers, milestonesSlipped, gatesBlocked };
    const { reported, calculated } = ragPair(signals);

    const targetPassed = Boolean(
      p.dueDate && p.dueDate < now && p.status !== "Completed" && p.status !== "Cancelled",
    );
    const scheduleSlipDays = p.dueDate ? Math.max(0, daysBetween(now, p.dueDate)) : 0;

    const dims = deriveDimensions({
      status: p.status,
      scheduleSlipDays: targetPassed ? scheduleSlipDays : 0,
      targetPassed,
      openRisks,
      redRisks,
      openBlockers,
      requirementCoverage: p.requirements.length ? Math.min(1, pct / 100) : null,
      openDefects: null, // no QA defect signal captured on projects yet → "not rated"
      hasBudgetData: Boolean(p.budget),
    });

    const latestActivity = [p.checkIns[0]?.createdAt, p.statusUpdates[0]?.createdAt]
      .filter(Boolean)
      .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] as Date | undefined;
    const freshnessDays = latestActivity ? Math.max(0, daysBetween(now, latestActivity)) : 999;

    const risks: CockpitRisk[] = [
      ...redIssues.map((i) => ({ id: i.id.slice(0, 8), title: i.title, severity: "R" as DimRag, owner: ownerName(i.ownerId) })),
      ...p.risks.slice(0, 4).map((r) => ({ id: r.id.slice(0, 8), title: r.title, severity: "A" as DimRag, owner: ownerName(r.ownerId) })),
    ].slice(0, 6);

    const markets: CockpitMarket[] = p.orgStatuses
      .filter((o) => o.orgUnit)
      .map((o) => ({
        market: o.orgUnit!.name,
        pct: o.progress,
        status: o.status,
        gates: deriveGates(o.progress, o.status === "Overdue", 0),
      }));

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      desc: p.objective ?? "",
      category: p.portfolio?.category ?? "Unfiled",
      portfolioName: p.portfolio?.name ?? null,
      pmId: p.leadUserId,
      pmName: p.lead?.name ?? null,
      status: p.status,
      reported,
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
      gates: deriveGates(pct, targetPassed, gatesBlocked),
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

  return { projects, pms: [...pmMap.values()], trend: buildTrend(snaps, now, trendWeeks), generatedAt: now };
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

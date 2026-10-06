import "server-only";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId, isoWeekMonday, weekRange, weekWindow } from "@/lib/iso-week";
import { heatBucket } from "@/components/raid/severity";
import { CHECKPOINT_STATE_LABEL } from "@/lib/checkpoint-view";
import { tallyRag, type Rag, type RagTally } from "@/server/health";
import { deriveDimensions, type DimRag } from "@/server/rag-dimensions";
import { getCurrentCheckIn } from "@/server/checkins";
import { getProjectPanelData } from "@/server/projects";
import { getProjectCheckpoints, type CheckpointState } from "@/server/checkpoints";
import { listProjectTasks } from "@/server/project-tasks";
import { listMilestones } from "@/server/milestones";
import { listBlockers } from "@/server/blockers";
import { listRisks } from "@/server/risks";
import { listIssues } from "@/server/issues";
import { getMarketTrack } from "@/server/rollout";
import { getRollupForWeek, getRollupWeek, portfolioOf, type RollupRow } from "@/server/portfolio-reports";
import { isHeadOfProjects } from "@/lib/rbac";
import { NUDGE_THRESHOLDS } from "@/server/nudger/config";
import { reportDataset, type ReportDatasetKey } from "@/lib/report-catalogue";
import { runCustomReport, type ReportCell } from "@/server/custom-reports";

/**
 * Milestone D — the read models behind the four PDF templates (handoff §5). Everything
 * here is assembled from readers that already exist (each opens its own withTenant), so a
 * PDF can never disagree with the workspace, the rail or the exec grid. Nothing is
 * invented: where the mock showed a field QUBIT does not hold (release numbers, channels,
 * uptime, an approver/needed-by on a decision) the template shows what exists instead.
 *
 * Week semantics: the check-in (narrative, RAG as signed, draft lines) is the chosen
 * week's stored row; gates, tasks, register and market status are LIVE — the footer says
 * so when the week is not the current one.
 */

export type ProjectTemplate = "build" | "market" | "dual";

export interface ReportBrand {
  tenantName: string;
  brandColor: string;
}

export interface ReportWeek {
  isoWeek: string;
  number: string;
  range: string;
  isCurrent: boolean;
  /** When the document was generated. */
  generatedAt: Date;
}

export interface DimensionCard {
  key: "Schedule" | "Delivery" | "Risk";
  rag: DimRag;
  line: string;
}

export interface GateCell {
  name: string;
  state: CheckpointState;
  label: string;
  note: string | null;
}

export interface NextStep {
  title: string;
  owner: string | null;
  due: Date | null;
}

export interface MarketRow {
  code: string;
  name: string;
  flag: string | null;
  status: string;
  progress: number;
  rag: Rag;
  checkedIn: boolean;
  narrative: string | null;
}

export interface ProjectReportData extends ReportBrand {
  template: ProjectTemplate;
  week: ReportWeek;
  project: {
    id: string;
    code: string;
    name: string;
    summary: string | null;
    pmName: string | null;
    sponsor: string | null;
    portfolioName: string | null;
    programmeName: string | null;
    pipelineStage: string;
    dueDate: Date | null;
  };
  checkIn: {
    status: "Draft" | "Confirmed";
    confirmedByName: string | null;
    confirmedAt: Date | null;
    narrative: string | null;
    lines: string[];
    buildRag: Rag;
    marketRag: Rag | null;
    overallRag: Rag;
    overrideReason: string | null;
  };
  dims: DimensionCard[];
  gates: GateCell[];
  gatesDone: number;
  doneThisWeek: string[];
  nextSteps: NextStep[];
  decision: { description: string; owner: string | null; ageDays: number; severity: string } | null;
  topRisk: { title: string; rating: string; mitigation: string | null; owner: string | null } | null;
  risksAndIssues: string[];
  boardCounts: { done: number; inProgress: number; blocked: number; overdue: number };
  markets: MarketRow[];
  marketKpis: { tracks: number; checkedIn: number; onTrack: number; gatesDone: number; gatesTotal: number };
}

export interface DigestRow extends RollupRow {
  stage: string;
  marketSummary: string | null;
}

export interface DigestGroup {
  portfolioName: string;
  rows: DigestRow[];
}

export interface DigestReportData extends ReportBrand {
  week: ReportWeek;
  status: "Draft" | "Approved" | "None";
  narrative: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  total: number;
  counts: RagTally;
  groups: DigestGroup[];
}

export interface TableReportData extends ReportBrand {
  dataset: ReportDatasetKey;
  title: string;
  moduleLabel: string;
  description: string;
  columns: { key: string; label: string; type: string }[];
  rows: Record<string, ReportCell>[];
  generatedAt: Date;
}

const DAY = 86_400_000;

async function tenantBrand(ctx: TenantContext): Promise<ReportBrand> {
  const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, brandColor: true } });
  return { tenantName: t?.name ?? "QUBIT", brandColor: t?.brandColor ?? "#231F20" };
}

function reportWeek(isoWeek: string, now: Date): ReportWeek {
  const monday = isoWeekMonday(isoWeek);
  return { isoWeek, number: isoWeek.split("-W")[1] ?? "", range: weekRange(monday), isCurrent: isoWeek === isoWeekId(now), generatedAt: now };
}

/** Which one-pager a project gets (handoff §5): markets decide, a build track is assumed
 * unless the project has neither a checkpoint template nor any tasks. */
export function pickTemplate(input: { markets: number; gates: number; tasks: number }): ProjectTemplate {
  if (input.markets === 0) return "build";
  if (input.gates === 0 && input.tasks === 0) return "market";
  return "dual";
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The three dimension cards from the same signals the cockpit derives (no stored ratings). */
export function dimensionCards(input: {
  status: string;
  dueDate: Date | null;
  now: Date;
  overdueTasks: number;
  slippedMilestones: number;
  nextMilestone: { name: string; dueDate: Date | null } | null;
  gates: GateCell[];
  openBlockers: number;
  openRisks: number;
  redRisks: number;
  topRisk: { title: string; rating: string } | null;
}): DimensionCard[] {
  const dims = deriveDimensions({
    status: input.status,
    targetPassed: Boolean(input.dueDate && input.dueDate.getTime() < input.now.getTime()),
    scheduleSlipDays: input.slippedMilestones > 0 ? 1 : 0,
    openBlockers: input.openBlockers,
    openRisks: input.openRisks,
    redRisks: input.redRisks,
  });
  const blockedGates = input.gates.filter((g) => g.state === "Blocked").length;
  const doneGates = input.gates.filter((g) => g.state === "Done").length;
  const delivery: DimRag = input.gates.length === 0 ? "N" : blockedGates > 0 ? "R" : doneGates === input.gates.length ? "G" : input.overdueTasks > 0 ? "A" : "G";
  const scheduleLine =
    input.overdueTasks > 0 || input.slippedMilestones > 0
      ? [input.overdueTasks > 0 ? `${plural(input.overdueTasks, "task")} overdue` : null, input.slippedMilestones > 0 ? `${plural(input.slippedMilestones, "milestone")} slipped` : null]
          .filter(Boolean)
          .join(" · ")
      : input.nextMilestone
        ? `Next: ${input.nextMilestone.name}${input.nextMilestone.dueDate ? ` · ${shortDate(input.nextMilestone.dueDate)}` : ""}`
        : "No overdue work.";
  const deliveryLine =
    input.gates.length === 0
      ? "No gate template on this project."
      : blockedGates > 0
        ? `${plural(blockedGates, "gate")} blocked · ${doneGates} of ${input.gates.length} done`
        : `${doneGates} of ${input.gates.length} gates done`;
  const riskLine =
    input.openRisks + input.openBlockers === 0
      ? "No open risks or blockers."
      : [
          input.openBlockers > 0 ? plural(input.openBlockers, "open blocker") : null,
          input.openRisks > 0 ? `${plural(input.openRisks, "open risk")}${input.topRisk ? ` (top: ${input.topRisk.rating})` : ""}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
  return [
    { key: "Schedule", rag: dims.Schedule, line: scheduleLine },
    { key: "Delivery", rag: delivery, line: deliveryLine },
    { key: "Risk", rag: dims.Risk, line: riskLine },
  ];
}

export function shortDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The exec view's "needs a decision" rule (Milestone B): the oldest open blocker that is
 * Critical or has waited longer than the nudger escalates to the Head. */
export function pickDecision<T extends { severity: string; dateRaised: Date; status: string }>(blockers: T[], now: Date): (T & { ageDays: number }) | null {
  const open = blockers
    .filter((b) => b.status === "Open")
    .map((b) => ({ ...b, ageDays: Math.max(0, Math.floor((now.getTime() - b.dateRaised.getTime()) / DAY)) }))
    .filter((b) => b.severity === "Critical" || b.ageDays >= NUDGE_THRESHOLDS.blockerHeadDays)
    .sort((a, b) => b.ageDays - a.ageDays);
  return open[0] ?? null;
}

/** Highest probability × impact among open/monitoring risks. */
export function pickTopRisk<T extends { probability: number; impact: number; status: string }>(risks: T[]): T | null {
  const live = risks.filter((r) => r.status === "Open" || r.status === "Monitoring");
  live.sort((a, b) => b.probability * b.impact - a.probability * a.impact);
  return live[0] ?? null;
}

export async function getProjectReport(
  ctx: TenantContext,
  projectId: string,
  isoWeek: string,
  now = new Date(),
  forced?: ProjectTemplate,
): Promise<ProjectReportData | null> {
  const project = await getProjectPanelData(ctx, projectId);
  if (!project) return null;
  const week = reportWeek(isoWeek, now);
  const window = weekWindow(isoWeekMonday(isoWeek));
  // The stored check-in for that week: a date inside the week selects it. For the current
  // week `now` keeps the live draft; for a past week the Monday reads the signed row.
  const at = week.isCurrent ? now : window.start;

  const [brand, checkIn, checkpoints, tasks, milestones, blockers, risks, issues] = await Promise.all([
    tenantBrand(ctx),
    getCurrentCheckIn(ctx, projectId, at),
    getProjectCheckpoints(ctx, projectId),
    listProjectTasks(ctx, projectId),
    listMilestones(ctx, projectId),
    listBlockers(ctx, { projectId }),
    listRisks(ctx, { projectId }),
    listIssues(ctx, { projectId }),
  ]);

  const gates: GateCell[] = checkpoints.rows.map((r) => ({
    name: r.name,
    state: r.state,
    label: CHECKPOINT_STATE_LABEL[r.state] ?? r.state,
    note: r.state === "Blocked" ? r.blockerReason : r.overrideReason,
  }));
  const gatesDone = gates.filter((g) => g.state === "Done").length;

  const open = tasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled");
  const doneThisWeek = tasks
    .filter((t) => t.status === "Completed" && t.lastActivityAt >= window.start && t.lastActivityAt < window.end)
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())
    .slice(0, 6)
    .map((t) => (t.taskKey ? `${t.taskKey} · ${t.title}` : t.title));
  const horizon = now.getTime() + 14 * DAY;
  const nextSteps: NextStep[] = open
    .filter((t) => t.dueDate && t.dueDate.getTime() <= horizon)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
    .slice(0, 5)
    .map((t) => ({ title: t.title, owner: t.assigneeName ?? t.externalAssigneeName, due: t.dueDate }));
  for (const m of milestones.filter((m) => m.status !== "Done" && m.dueDate && m.dueDate.getTime() <= now.getTime() + 30 * DAY)) {
    if (nextSteps.length >= 6) break;
    nextSteps.push({ title: `Milestone: ${m.name}`, owner: null, due: m.dueDate });
  }

  const openBlockers = blockers.filter((b) => b.status === "Open");
  const decisionRow = pickDecision(blockers, now);
  const decision = decisionRow ? { description: decisionRow.description, owner: decisionRow.ownerName, ageDays: decisionRow.ageDays, severity: decisionRow.severity } : null;
  const openRisks = risks.filter((r) => r.status === "Open" || r.status === "Monitoring");
  const top = pickTopRisk(risks);
  const topRisk = top ? { title: top.title, rating: heatBucket(top.probability, top.impact), mitigation: top.mitigation, owner: top.ownerName } : null;
  const openIssues = issues.filter((i) => i.status !== "Resolved" && i.status !== "Closed");
  const risksAndIssues = [
    ...openBlockers.slice(0, 3).map((b) => `Blocker: ${b.description}`),
    ...openRisks.slice(0, 3).map((r) => `Risk (${heatBucket(r.probability, r.impact)}): ${r.title}`),
    ...openIssues.slice(0, 3).map((i) => `Issue (${i.severity}): ${i.title}`),
  ].slice(0, 6);

  const overdue = open.filter((t) => t.dueDate && t.dueDate.getTime() < now.getTime()).length;
  const boardCounts = {
    done: doneThisWeek.length,
    inProgress: open.filter((t) => ["InProgress", "InReview", "InQA"].includes(t.status)).length,
    blocked: open.filter((t) => t.blocked).length,
    overdue,
  };
  const nextMilestone = milestones.find((m) => m.status !== "Done" && m.dueDate && m.dueDate.getTime() >= now.getTime()) ?? null;
  const dims = dimensionCards({
    status: project.status,
    dueDate: project.dueDate,
    now,
    overdueTasks: overdue,
    slippedMilestones: milestones.filter((m) => m.overdue).length,
    nextMilestone: nextMilestone ? { name: nextMilestone.name, dueDate: nextMilestone.dueDate } : null,
    gates,
    openBlockers: openBlockers.length,
    openRisks: openRisks.length,
    redRisks: openRisks.filter((r) => heatBucket(r.probability, r.impact) === "Critical").length,
    topRisk,
  });

  // Markets: this week's narrative + the per-market gate matrix, via the same reader the
  // market page uses. Capped — a one-pager with more markets than fit is a digest's job.
  const tracks = await Promise.all(checkIn.markets.slice(0, 8).map((m) => getMarketTrack(ctx, projectId, m.orgUnitId, at)));
  const markets: MarketRow[] = checkIn.markets.slice(0, 8).map((m, i) => ({
    code: m.code,
    name: tracks[i]?.market.name ?? m.code,
    flag: m.flag,
    status: m.status,
    progress: m.progress,
    rag: m.rag,
    checkedIn: m.checkedIn,
    narrative: tracks[i]?.checkIn?.narrative ?? null,
  }));
  const marketGates = tracks.flatMap((t) => t?.rows ?? []);
  const marketKpis = {
    tracks: checkIn.markets.length,
    checkedIn: checkIn.markets.filter((m) => m.checkedIn).length,
    onTrack: checkIn.markets.filter((m) => m.status === "OnTrack" || m.status === "Completed").length,
    gatesDone: marketGates.filter((r) => r.state === "Done").length,
    gatesTotal: marketGates.length,
  };

  return {
    ...brand,
    template: forced ?? pickTemplate({ markets: checkIn.markets.length, gates: gates.length, tasks: tasks.length }),
    week,
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      summary: project.objective ?? project.statusNote ?? null,
      pmName: project.leadName,
      sponsor: project.businessOwner ?? project.client ?? null,
      portfolioName: project.portfolioName,
      programmeName: project.programmeName,
      pipelineStage: project.pipelineStage,
      dueDate: project.dueDate,
    },
    checkIn: {
      status: checkIn.status,
      confirmedByName: checkIn.confirmedByName,
      confirmedAt: checkIn.confirmedAt,
      narrative: checkIn.narrative,
      lines: checkIn.lines,
      buildRag: checkIn.buildRag,
      marketRag: checkIn.marketRag,
      overallRag: checkIn.overallRag,
      overrideReason: checkIn.status === "Confirmed" ? checkIn.overrideReason : null,
    },
    dims,
    gates,
    gatesDone,
    doneThisWeek,
    nextSteps,
    decision,
    topRisk,
    risksAndIssues,
    boardCounts,
    markets,
    marketKpis,
  };
}

/** The Head's roll-up for a week. Heads get the same view as their rail (frozen once
 * Approved, otherwise assembled live — a Draft digest, watermarked as such); everyone
 * else only ever sees an Approved week (getRollupWeek's gate), like the CSV export. */
export async function getDigestReport(
  ctx: TenantContext,
  isoWeek: string,
  opts: { portfolioId?: string; now?: Date } = {},
): Promise<DigestReportData | null> {
  const now = opts.now ?? new Date();
  const view = isHeadOfProjects(ctx) ? await getRollupForWeek(ctx, isoWeek, now) : await getRollupWeek(ctx, isoWeek);
  if (!view) return null;
  const brand = await tenantBrand(ctx);
  const ids = view.rows.map((r) => r.projectId);
  const extras = await withTenant(ctx, (tx) =>
    tx.project.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        pipelineStage: true,
        portfolioId: true,
        orgStatuses: { where: { orgUnit: { kind: "Market" } }, select: { status: true } },
      },
    }),
  );
  const byId = new Map(extras.map((p) => [p.id, p]));
  const rows: DigestRow[] = view.rows
    .filter((r) => !opts.portfolioId || byId.get(r.projectId)?.portfolioId === opts.portfolioId)
    .map((r) => {
      const p = byId.get(r.projectId);
      const markets = p?.orgStatuses ?? [];
      const live = markets.filter((m) => m.status === "OnTrack" || m.status === "Completed").length;
      return {
        ...r,
        stage: p?.pipelineStage ?? "—",
        marketSummary: markets.length ? `In market: ${live} of ${markets.length} on track` : null,
      };
    });
  const groupMap = new Map<string, DigestRow[]>();
  for (const r of rows) {
    const k = portfolioOf(r);
    groupMap.set(k, [...(groupMap.get(k) ?? []), r]);
  }
  const groups = [...groupMap.entries()]
    .sort(([a], [b]) => (a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b)))
    .map(([portfolioName, rs]) => ({ portfolioName, rows: rs.sort((a, b) => a.name.localeCompare(b.name)) }));
  return {
    ...brand,
    week: reportWeek(isoWeek, now),
    status: view.status,
    narrative: view.narrative,
    approvedByName: view.approvedByName,
    approvedAt: view.approvedAt,
    total: rows.length,
    counts: tallyRag(rows.map((r) => ({ rag: r.rag, computed: r.checkIn !== "Confirmed" }))),
    groups,
  };
}

/** A custom "Data table" report (any module, the chosen columns) in the print style. The
 * engine owns the column allow-list and the dataset's row scope; this only adds the brand. */
export async function getTableReport(ctx: TenantContext, dataset: ReportDatasetKey, columns: string[], now = new Date()): Promise<TableReportData> {
  const [brand, result] = await Promise.all([tenantBrand(ctx), runCustomReport(ctx, dataset, columns)]);
  const meta = reportDataset(dataset);
  return { ...brand, dataset, title: meta.label, moduleLabel: meta.moduleLabel, description: meta.description, columns: result.columns, rows: result.rows, generatedAt: now };
}

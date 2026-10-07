import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { pmIdsOf, runsProjectWhere } from "@/lib/ownership";
import { can, isHeadOfProjects } from "@/lib/rbac";
import { isoWeekId, isoWeekMonday, isValidIsoWeek, shiftIsoWeek, weekRange, weekWindow } from "@/lib/iso-week";
import { effectiveRag, getCurrentCheckIn, type CheckInDraft } from "@/server/checkins";
import { projectRag, ragRank, tallyRag, type Rag, type RagTally } from "@/server/health";
import { getApprovedRollupForWeek, getRollupForWeek, type ApprovedRollup, type RollupView } from "@/server/portfolio-reports";
import { NUDGE_THRESHOLDS } from "@/server/nudger/config";

/**
 * Milestone B (docs handoff §3) — ONE read model behind /reports, composed per role:
 *  - PM: their own projects' status updates for a week (the My week queue, re-homed),
 *    plus the 8-week grid for History;
 *  - Head: every active project's update in one inbox, grouped by portfolio, with
 *    the week's roll-up beside it;
 *  - Executive: the approved roll-up, "status by project · last 8 weeks", the week's
 *    G/A/R tiles and the blockers that need a decision.
 * Any week can be asked for. A closed week's RAG is evaluated at that week's END, so a
 * signed override still reads as signed (the 7-day expiry would otherwise erase history).
 */

export type ReportsView = "pm" | "head" | "exec";

export class ReportsWeekError extends Error {
  constructor(
    message: string,
    public code: "BAD_WEEK" | "FORBIDDEN",
  ) {
    super(message);
    this.name = "ReportsWeekError";
  }
}

const ACTIVE = { notIn: ["Completed", "Cancelled"] };
const DAY = 86_400_000;
/** Row-less projects in the CURRENT week get a computed draft each (own tx, ~10 queries) — capped. */
const PM_DRAFT_CAP = 40;
export const GRID_WEEKS = 8;

const CHECKIN_SELECT = {
  isoWeek: true,
  status: true,
  computedRag: true,
  ragOverride: true,
  overrideReason: true,
  overrideExpiresAt: true,
  narrative: true,
  draft: true,
  confirmedAt: true,
  submittedToHeadAt: true,
} as const;
type CiRow = Prisma.CheckInGetPayload<{ select: typeof CHECKIN_SELECT }>;

const projectSelect = (weeks: string[]) =>
  ({
    id: true,
    code: true,
    name: true,
    status: true,
    leadUserId: true,
    lead: { select: { name: true } },
    portfolio: { select: { id: true, name: true } },
    members: { where: { role: "Project Manager" }, select: { userId: true } },
    pmScope: true,
    orgStatuses: { where: { retiredAt: null, leadUserId: { not: null } }, select: { leadUserId: true } },
    checkIns: { where: { isoWeek: { in: weeks } }, select: CHECKIN_SELECT },
  }) satisfies Prisma.ProjectSelect;
type ProjectRow = Prisma.ProjectGetPayload<{ select: ReturnType<typeof projectSelect> }>;

export interface WeekMeta {
  isoWeek: string;
  /** "6–10 Oct" */
  range: string;
  isCurrent: boolean;
  prev: string;
  /** null on the current week — the page never offers the future. */
  next: string | null;
}

export interface PmWeekRow {
  projectId: string;
  code: string;
  name: string;
  portfolioName: string;
  /** "None" = no persisted row for a past week. */
  status: "Draft" | "Confirmed" | "None";
  computedRag: Rag;
  effectiveRag: Rag;
  narrative: string | null;
  /** The draft's RAG override (e.g. from an uploaded status report) and its reason —
   *  shown and sent as such; effectiveRag ignores overrides until confirmed. */
  ragOverride: Rag | null;
  overrideReason: string | null;
  draftLines: string[];
  confirmed: boolean;
  sentToHead: boolean;
  sentAt: Date | null;
  canConfirm: boolean;
}

export interface GridCell {
  isoWeek: string;
  /** null = no check-in that week (hollow). */
  rag: Rag | null;
}
export interface GridRow {
  projectId: string;
  code: string;
  name: string;
  line: string | null;
  lineWeek: string | null;
  cells: GridCell[];
}
export interface GridGroup {
  portfolioName: string;
  ragCounts: RagTally;
  rows: GridRow[];
}

export interface PmWeekView {
  kind: "pm";
  rows: PmWeekRow[];
  meter: { sent: number; total: number; toSend: number };
  ragCounts: RagTally;
  /** The viewer's projects over the 8 weeks ending at the chosen week (History tab). */
  grid: GridGroup[];
}

export interface InboxRow {
  projectId: string;
  code: string;
  name: string;
  pmName: string | null;
  status: "Confirmed" | "Draft" | "None";
  /** Confirmed AND sent to the Head. */
  received: boolean;
  rag: Rag;
  /** The RAG is derived, not the PM's confirmed word. */
  computed: boolean;
  line: string | null;
  sentAt: Date | null;
  /** The project has a lead or PM member to nudge. */
  nudgeable: boolean;
}
export interface InboxGroup {
  portfolioId: string | null;
  portfolioName: string;
  in: number;
  total: number;
  rows: InboxRow[];
}
export interface HeadWeekView {
  kind: "head";
  header: { in: number; total: number; outstanding: number };
  groups: InboxGroup[];
  rollup: RollupView;
  ragCounts: RagTally;
  can: { approve: boolean; nudge: boolean };
}

export interface DecisionBlocker {
  id: string;
  description: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  ageDays: number;
  severity: string;
  /** Older than the nudger's Head-escalation threshold. */
  escalated: boolean;
}
export interface ExecWeekView {
  kind: "exec";
  approved: ApprovedRollup | null;
  /** The 8 week ids, oldest → chosen. */
  weeks: string[];
  grid: GridGroup[];
  tiles: { green: number; amber: number; red: number; total: number };
  delta: string;
  decisions: DecisionBlocker[];
}

export type ReportsWeek = { week: WeekMeta } & (PmWeekView | HeadWeekView | ExecWeekView);

// ── helpers ──────────────────────────────────────────────────────────────

/** The instant to evaluate a week's RAG overrides at: now, or that week's end if it closed. */
function evalAt(isoWeek: string, now: Date): Date {
  const end = weekWindow(isoWeekMonday(isoWeek)).end;
  return now < end ? now : end;
}

function ragOf(ci: CiRow | undefined, projectStatus: string, at: Date): Rag {
  return ci ? effectiveRag(ci, at) : projectRag(projectStatus);
}

/** Name asc, "Unassigned" last — the pipeline's precedent. */
function byPortfolioName(a: { portfolioName: string }, b: { portfolioName: string }): number {
  if (a.portfolioName === "Unassigned") return 1;
  if (b.portfolioName === "Unassigned") return -1;
  return a.portfolioName.localeCompare(b.portfolioName);
}

function gridWeeksEnding(isoWeek: string): string[] {
  return Array.from({ length: GRID_WEEKS }, (_, i) => shiftIsoWeek(isoWeek, i - (GRID_WEEKS - 1)));
}

/** Per project, one cell per week; grouped by portfolio with the chosen week's tally. */
function buildGrid(projects: ProjectRow[], weeks: string[], now: Date): GridGroup[] {
  const chosen = weeks[weeks.length - 1]!;
  const groups = new Map<string, { portfolioName: string; rows: GridRow[]; tally: { rag: Rag; computed: boolean }[] }>();
  for (const p of projects) {
    const byWeek = new Map(p.checkIns.map((c) => [c.isoWeek, c]));
    const cells = weeks.map((w) => {
      const ci = byWeek.get(w);
      return { isoWeek: w, rag: ci ? effectiveRag(ci, evalAt(w, now)) : null };
    });
    const cur = byWeek.get(chosen);
    let line = cur?.status === "Confirmed" ? cur.narrative : null;
    let lineWeek = line ? chosen : null;
    if (!line) {
      for (let i = weeks.length - 2; i >= 0; i--) {
        const ci = byWeek.get(weeks[i]!);
        if (ci?.status === "Confirmed" && ci.narrative) {
          line = ci.narrative;
          lineWeek = weeks[i]!;
          break;
        }
      }
    }
    const name = p.portfolio?.name ?? "Unassigned";
    const g = groups.get(name) ?? { portfolioName: name, rows: [], tally: [] };
    g.rows.push({ projectId: p.id, code: p.code, name: p.name, line, lineWeek, cells });
    g.tally.push({ rag: ragOf(cur, p.status, evalAt(chosen, now)), computed: cur?.status !== "Confirmed" });
    groups.set(name, g);
  }
  return [...groups.values()]
    .map((g) => ({ portfolioName: g.portfolioName, ragCounts: tallyRag(g.tally), rows: g.rows }))
    .sort(byPortfolioName);
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const word = (n: number) => WORDS[n] ?? String(n);

/** The exec tiles' one-line reading of the grid — pure, from recorded (non-null) cells only. */
export function deltaSentence(groups: GridGroup[], weeks: string[]): string {
  const rows = groups.flatMap((g) => g.rows);
  const count = (i: number) => {
    const t = { green: 0, amber: 0, red: 0, n: 0 };
    for (const r of rows) {
      const rag = r.cells[i]?.rag;
      if (!rag) continue;
      t.n++;
      if (rag === "Green") t.green++;
      else if (rag === "Amber") t.amber++;
      else t.red++;
    }
    return t;
  };
  const last = weeks.length - 1;
  if (last < 1) return "";
  const cur = count(last);
  const prev = count(last - 1);
  let s: string;
  if (prev.n === 0) s = "No check-ins were recorded last week.";
  else if (cur.red > prev.red) s = `${capitalize(word(cur.red - prev.red))} more red than last week.`;
  else if (cur.red < prev.red) s = `${capitalize(word(prev.red - cur.red))} fewer red than last week.`;
  else if (cur.green > prev.green) s = `Up ${word(cur.green - prev.green)} green on last week.`;
  else if (cur.green < prev.green) s = `Down ${word(prev.green - cur.green)} green on last week.`;
  else s = "Unchanged from last week.";
  if (weeks.length >= 3) {
    const weeksWithData = weeks.filter((_, i) => count(i).n > 0).length;
    if (weeksWithData >= 3) {
      const streak = rows.filter((r) => r.cells.slice(-3).every((c) => c.rag === "Red")).length;
      s += streak === 0 ? " No project has been red for more than two weeks." : ` ${capitalize(word(streak))} project${streak === 1 ? "" : "s"} red for three weeks or more.`;
    }
  }
  return s;
}
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── the read ─────────────────────────────────────────────────────────────

export async function getReportsWeek(
  ctx: TenantContext,
  opts: { isoWeek: string; view: ReportsView; now?: Date; previewing?: boolean },
): Promise<ReportsWeek> {
  const now = opts.now ?? new Date();
  const { isoWeek, view } = opts;
  const previewing = opts.previewing ?? false;
  if (!isValidIsoWeek(isoWeek)) throw new ReportsWeekError("Pass week=YYYY-Www.", "BAD_WEEK");
  if (view !== "pm" && !can(ctx, "reports:read")) throw new ReportsWeekError("Reports are for reports:read holders.", "FORBIDDEN");
  const isCurrent = isoWeek === isoWeekId(now);
  const at = evalAt(isoWeek, now);
  const week: WeekMeta = {
    isoWeek,
    range: weekRange(isoWeekMonday(isoWeek)),
    isCurrent,
    prev: shiftIsoWeek(isoWeek, -1),
    next: isCurrent ? null : shiftIsoWeek(isoWeek, 1),
  };

  if (view === "pm") {
    const weeks = gridWeeksEnding(isoWeek);
    const projects = await withTenant(ctx, (tx) =>
      tx.project.findMany({
        where: {
          status: ACTIVE,
          ...runsProjectWhere(ctx.userId),
        },
        select: projectSelect(weeks),
        orderBy: { name: "asc" },
      }),
    );
    const canConfirm = isCurrent && !previewing;
    const rows: PmWeekRow[] = [];
    let drafted = 0;
    for (const p of projects) {
      const ci = p.checkIns.find((c) => c.isoWeek === isoWeek);
      const base = { projectId: p.id, code: p.code, name: p.name, portfolioName: p.portfolio?.name ?? "Unassigned", canConfirm };
      if (ci) {
        rows.push({
          ...base,
          status: ci.status as "Draft" | "Confirmed",
          computedRag: ci.computedRag as Rag,
          effectiveRag: effectiveRag(ci, at),
          narrative: ci.narrative,
          ragOverride: (ci.ragOverride as Rag | null) ?? null,
          overrideReason: ci.overrideReason ?? null,
          draftLines: (ci.draft as unknown as CheckInDraft | null)?.lines ?? [],
          confirmed: ci.status === "Confirmed",
          sentToHead: Boolean(ci.submittedToHeadAt),
          sentAt: ci.submittedToHeadAt,
        });
      } else if (isCurrent && drafted < PM_DRAFT_CAP) {
        drafted++;
        const v = await getCurrentCheckIn(ctx, p.id, now);
        rows.push({
          ...base,
          status: v.status,
          computedRag: v.computedRag,
          effectiveRag: v.effectiveRag,
          narrative: v.narrative,
          ragOverride: (v.ragOverride as Rag | null) ?? null,
          overrideReason: v.overrideReason,
          draftLines: v.lines,
          confirmed: v.status === "Confirmed",
          sentToHead: Boolean(v.submittedToHeadAt),
          sentAt: v.submittedToHeadAt,
        });
      } else {
        const rag = projectRag(p.status);
        rows.push({ ...base, status: "None", computedRag: rag, effectiveRag: rag, narrative: null, ragOverride: null, overrideReason: null, draftLines: [], confirmed: false, sentToHead: false, sentAt: null });
      }
    }
    // Unconfirmed first (they need action), then not-yet-sent, then done; worst RAG first.
    const stage = (r: PmWeekRow) => (!r.confirmed ? 0 : !r.sentToHead ? 1 : 2);
    rows.sort((a, b) => stage(a) - stage(b) || ragRank(a.effectiveRag) - ragRank(b.effectiveRag) || a.name.localeCompare(b.name));
    const sent = rows.filter((r) => r.sentToHead).length;
    return {
      week,
      kind: "pm",
      rows,
      meter: { sent, total: rows.length, toSend: rows.length - sent },
      ragCounts: tallyRag(rows.map((r) => ({ rag: r.effectiveRag, computed: !r.confirmed }))),
      grid: buildGrid(projects, weeks, now),
    };
  }

  const isHead = isHeadOfProjects(ctx);

  if (view === "head") {
    const projects = await withTenant(ctx, (tx) =>
      tx.project.findMany({ where: { status: ACTIVE }, select: projectSelect([isoWeek]), orderBy: { name: "asc" } }),
    );
    const groups = new Map<string, InboxGroup>();
    const all: InboxRow[] = [];
    for (const p of projects) {
      const ci = p.checkIns[0];
      const received = ci?.status === "Confirmed" && Boolean(ci.submittedToHeadAt);
      const row: InboxRow = {
        projectId: p.id,
        code: p.code,
        name: p.name,
        pmName: p.lead?.name ?? null,
        status: ci?.status === "Confirmed" ? "Confirmed" : ci ? "Draft" : "None",
        received,
        rag: ragOf(ci, p.status, at),
        computed: ci?.status !== "Confirmed",
        line: ci?.status === "Confirmed" ? ci.narrative : null,
        sentAt: ci?.submittedToHeadAt ?? null,
        nudgeable: pmIdsOf(p).length > 0,
      };
      all.push(row);
      const name = p.portfolio?.name ?? "Unassigned";
      const g = groups.get(name) ?? { portfolioId: p.portfolio?.id ?? null, portfolioName: name, in: 0, total: 0, rows: [] };
      g.rows.push(row);
      g.total++;
      if (received) g.in++;
      groups.set(name, g);
    }
    const rollup = await getRollupForWeek(ctx, isoWeek, now);
    const inCount = all.filter((r) => r.received).length;
    return {
      week,
      kind: "head",
      header: { in: inCount, total: all.length, outstanding: all.length - inCount },
      groups: [...groups.values()].sort(byPortfolioName),
      rollup,
      ragCounts: tallyRag(all.map((r) => ({ rag: r.rag, computed: r.computed }))),
      can: {
        approve: isHead && isCurrent && !previewing && rollup.status !== "Approved",
        nudge: isHead && isCurrent && !previewing,
      },
    };
  }

  // exec
  const weeks = gridWeeksEnding(isoWeek);
  const cutoff = new Date(now.getTime() - NUDGE_THRESHOLDS.blockerHeadDays * DAY);
  const [projects, blockers] = await withTenant(ctx, (tx) =>
    Promise.all([
      tx.project.findMany({ where: { status: ACTIVE }, select: projectSelect(weeks), orderBy: { name: "asc" } }),
      tx.blocker.findMany({
        where: { status: "Open", project: { status: ACTIVE }, OR: [{ severity: "Critical" }, { dateRaised: { lt: cutoff } }] },
        select: { id: true, description: true, severity: true, dateRaised: true, projectId: true, project: { select: { code: true, name: true } } },
        orderBy: { dateRaised: "asc" },
        take: 6,
      }),
    ]),
  );
  const grid = buildGrid(projects, weeks, now);
  const chosenAt = evalAt(isoWeek, now);
  const tally = tallyRag(
    projects.map((p) => {
      const ci = p.checkIns.find((c) => c.isoWeek === isoWeek);
      return { rag: ragOf(ci, p.status, chosenAt), computed: ci?.status !== "Confirmed" };
    }),
  );
  return {
    week,
    kind: "exec",
    approved: await getApprovedRollupForWeek(ctx, isoWeek),
    weeks,
    grid,
    tiles: { green: tally.green, amber: tally.amber, red: tally.red, total: projects.length },
    delta: deltaSentence(grid, weeks),
    decisions: blockers.map((b) => {
      const ageDays = Math.max(0, Math.floor((now.getTime() - b.dateRaised.getTime()) / DAY));
      return {
        id: b.id,
        description: b.description,
        projectId: b.projectId,
        projectCode: b.project.code,
        projectName: b.project.name,
        ageDays,
        severity: b.severity,
        escalated: ageDays >= NUDGE_THRESHOLDS.blockerHeadDays,
      };
    }),
  };
}

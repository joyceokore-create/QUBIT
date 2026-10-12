import "server-only";
import { z } from "zod";
import { canWriteProject } from "@/lib/access";
import { can } from "@/lib/rbac";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId, isoWeekMonday, isValidIsoWeek } from "@/lib/iso-week";
import { runsProjectWhere } from "@/lib/ownership";

import { confirmCheckIn, getCurrentCheckIn, RAGS, saveCheckInDraft } from "@/server/checkins";
import { CHECKPOINT_STATES, CheckpointError, listCheckpointTemplates, setCheckpointState, setProjectTemplate, type CheckpointState, type GateScope, type StateOrigin } from "@/server/checkpoints";
import { createDocument } from "@/server/documents";
import type { Rag } from "@/server/health";
import { INSTANCE_STATES, setInstanceState, type InstanceState } from "@/server/project-instances";
import { createProject, updateProject } from "@/server/projects";
import { saveMarketCheckIn } from "@/server/rollout";
import { extractStatusReport, NARRATIVE_MAX, STAGE_MAX, type ParsedRow, type ReportFormat } from "@/server/status-report/parse";
import { matchProjectAndMarket, type MatchableProject, type RowMatch } from "@/server/status-report/match";
import { resolveDelivery, type DeliveryCatalog, type DeliveryPlan } from "@/lib/status-report-delivery";

/**
 * Weekly update workspace (Reports › Update all my projects). GET the WORKSPACE — every
 * project the viewer runs, prefilled from QUBIT: the delivery catalog (gates and their
 * states per scope, channel states per market), this week's line and RAG, the status
 * note, this week's market check-ins — so the PM keys in everything in one place. A
 * report file is only a way to prefill it: PREVIEW parses the file and matches rows to
 * the viewer's own projects (nothing written); APPLY writes what the PM reviewed — the
 * product's weekly draft
 * (saveCheckInDraft: narrative + the report's RAG as a reasoned override), writes the Stage
 * into the project's status note (updateProject — the PM's own governance field) and
 * attaches the file to the project's Documents. Sending stays the PM's one action
 * (confirm & send) so nothing reaches the Head unreviewed — except a row the PM marks
 * "replace": a week already sent is re-confirmed with the new line and RAG (= resent, the
 * Head is notified again), which is how a sent update is recalled by uploading a new file.
 * The Stage cell also moves the delivery gates when it names one ("UAT …" → UAT in
 * progress, the gates before it done) — resolved into the review like every other change
 * (lib/status-report-delivery), never applied unseen. A report can be for a PAST week (last week, or any
 * earlier date): its rows are then sent as reviewed in the dialog, since a closed week has
 * no queue to confirm from — they land in that week's Head inbox and roll-up.
 *
 * docs/38 — a PowerPoint one-pager also carries DELIVERY: its "Where we are" stages
 * become gate states on the Product build track (the product's own row plus every market
 * at product level, or one market's copy when the slide is about one market), and its
 * channels-by-market grid / per-market list becomes module states per market. A slide
 * titled after a market ("Swipe Rwanda") writes that market's check-in rather than the
 * product's weekly update. Every change is resolved into a plan the PM sees and ticks
 * (lib/status-report-delivery) — the upload never writes on a guess.
 */

export class UploadWeekError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadWeekError";
  }
}

/** The week a report is for: this week (default) or a past ISO week. Past weeks are
 * written "as of" that week's Friday 17:00 UTC so the rows sit in the right week. */
export function resolveReportWeek(week: string | null | undefined, now = new Date()): { isoWeek: string; at: Date; past: boolean } {
  const current = isoWeekId(now);
  if (!week || week === current) return { isoWeek: current, at: now, past: false };
  if (!isValidIsoWeek(week)) throw new UploadWeekError("Pick a valid week.");
  const monday = isoWeekMonday(week);
  if (monday > now) throw new UploadWeekError("That week hasn't happened yet.");
  const at = new Date(monday.getTime() + 4 * 86_400_000 + 17 * 3_600_000);
  return { isoWeek: week, at, past: true };
}

export interface PreviewRow extends ParsedRow {
  match: RowMatch;
  /** This week's state of the matched project, so the table can say "already sent". */
  alreadySent: boolean;
  /** The matched project's computed RAG — proposed when the file carries none. */
  computedRag: Rag | null;
  /** What the slide would change on the matched project's delivery (null = no project). */
  delivery: DeliveryPlan | null;
}

export interface UploadPreview {
  format: ReportFormat;
  preparedBy: string | null;
  reportDate: string | null;
  isoWeek: string;
  /** A past week: rows will be sent as reviewed (no queue to confirm from). */
  past: boolean;
  rows: PreviewRow[];
  projects: MatchableProject[];
  /** Delivery catalogs of the matched projects, so the dialog can re-resolve a row
   * when the PM picks another project (other projects are fetched on demand). */
  catalogs: Record<string, DeliveryCatalog>;
  warnings: string[];
}

/** One project's delivery, as the resolver needs it: markets, modules, gates and the
 * current states of each (product track + every market's copy; module × market). */
export async function getDeliveryCatalog(ctx: TenantContext, projectId: string): Promise<DeliveryCatalog | null> {
  return withTenant(ctx, async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        id: true, code: true, name: true, moduleLabel: true,
        checkpointTemplate: { select: { name: true, checkpoints: { select: { id: true, name: true, orderIndex: true }, orderBy: { orderIndex: "asc" } } } },
        orgStatuses: { where: { retiredAt: null }, select: { orgUnitId: true, orgUnit: { select: { code: true, name: true, flag: true } } }, orderBy: { orgUnit: { code: "asc" } } },
        modules: { select: { id: true, name: true, code: true, kind: true }, orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!project) return null;
    const [gateStates, moduleStates] = await Promise.all([
      tx.checkpointStatus.findMany({ where: { projectId, moduleId: null }, select: { orgUnitId: true, checkpointId: true, state: true } }),
      tx.moduleInstanceStatus.findMany({ where: { projectId }, select: { moduleId: true, orgUnitId: true, state: true, note: true } }),
    ]);
    return {
      projectId: project.id,
      code: project.code,
      name: project.name,
      moduleLabel: project.moduleLabel,
      templateName: project.checkpointTemplate?.name ?? null,
      markets: project.orgStatuses.map((o) => ({ orgUnitId: o.orgUnitId, code: o.orgUnit.code, name: o.orgUnit.name, flag: o.orgUnit.flag })),
      modules: project.modules.map((m) => ({ id: m.id, name: m.name, code: m.code, kind: m.kind as "instance" | "module" })),
      gates: project.checkpointTemplate?.checkpoints.map((c) => ({ checkpointId: c.id, name: c.name, orderIndex: c.orderIndex })) ?? [],
      gateStates: gateStates.map((g) => ({ orgUnitId: g.orgUnitId, checkpointId: g.checkpointId, state: g.state as CheckpointState })),
      moduleStates: moduleStates.map((m) => ({ moduleId: m.moduleId, orgUnitId: m.orgUnitId, state: m.state as InstanceState, note: m.note })),
    };
  });
}

/** One project in the weekly update workspace: everything editable, as QUBIT has it now. */
export interface WorkspaceProject {
  catalog: DeliveryCatalog;
  product: {
    status: "Draft" | "Confirmed" | "None";
    narrative: string;
    computedRag: Rag;
    ragOverride: Rag | null;
    statusNote: string;
    alreadySent: boolean;
  };
  /** This week's market check-ins (rag null = none yet). */
  markets: { orgUnitId: string; rag: Rag | null; narrative: string }[];
}
export interface StatusWorkspace {
  isoWeek: string;
  past: boolean;
  projects: WorkspaceProject[];
}

export async function getStatusWorkspace(ctx: TenantContext, week?: string | null, now = new Date()): Promise<StatusWorkspace> {
  const { isoWeek, at, past } = resolveReportWeek(week, now);
  const projects = await matchableProjects(ctx);
  const ids = projects.map((p) => p.id);
  const extra = await withTenant(ctx, async (tx) => {
    const [notes, marketCheckIns] = await Promise.all([
      tx.project.findMany({ where: { id: { in: ids } }, select: { id: true, statusNote: true } }),
      tx.marketCheckIn.findMany({ where: { projectId: { in: ids }, isoWeek }, select: { projectId: true, orgUnitId: true, narrative: true, rag: true } }),
    ]);
    return { notes: new Map(notes.map((n) => [n.id, n.statusNote ?? ""])), market: new Map(marketCheckIns.map((c) => [`${c.projectId}:${c.orgUnitId}`, c])) };
  });
  const out: WorkspaceProject[] = [];
  for (const p of projects) {
    const [catalog, ci] = await Promise.all([getDeliveryCatalog(ctx, p.id), getCurrentCheckIn(ctx, p.id, at)]);
    if (!catalog) continue;
    out.push({
      catalog,
      product: {
        status: ci.status,
        narrative: ci.narrative ?? "",
        computedRag: ci.computedRag,
        ragOverride: (ci.ragOverride as Rag | null) ?? null,
        statusNote: extra.notes.get(p.id) ?? "",
        alreadySent: ci.status === "Confirmed",
      },
      markets: catalog.markets.map((m) => {
        const c = extra.market.get(`${p.id}:${m.orgUnitId}`);
        return { orgUnitId: m.orgUnitId, rag: (c?.rag as Rag | undefined) ?? null, narrative: c?.narrative ?? "" };
      }),
    });
  }
  return { isoWeek, past, projects: out };
}

export const ApplyInput = z.object({
  /** ISO week the report is for (default: this week). */
  week: z.string().regex(/^\d{4}-W\d{2}$/).optional(),
  preparedBy: z.string().trim().max(120).nullable().optional(),
  reportDate: z.string().trim().max(40).nullable().optional(),
  rows: z
    .array(
      z.object({
        projectId: z.string().uuid(),
        /** The product's line for the Head — empty = leave the weekly update alone. */
        narrative: z.string().trim().max(NARRATIVE_MAX).optional().default(""),
        rag: z.enum(RAGS).optional(),
        stage: z.string().trim().max(STAGE_MAX).optional().default(""),
        /** Replace an already-sent week with this line and resend it. */
        resend: z.boolean().optional(),
        /** Gate states the PM set: orgUnitId null = the product track (every market at
         * product level), set = that market's copy. */
        gates: z.array(z.object({ checkpointId: z.string().min(1), state: z.enum(CHECKPOINT_STATES), orgUnitId: z.string().uuid().nullable().optional() })).max(200).optional(),
        /** Module states per market the PM set. */
        modules: z
          .array(z.object({ moduleId: z.string().min(1), orgUnitId: z.string().uuid().nullable(), state: z.enum(INSTANCE_STATES), note: z.string().trim().max(200).nullable().optional() }))
          .max(400)
          .optional(),
        /** This week's market check-ins (focus & blockers per market). */
        markets: z.array(z.object({ orgUnitId: z.string().uuid(), rag: z.enum(RAGS), narrative: z.string().trim().min(1).max(1000) })).max(40).optional(),
      }),
    )
    .min(1)
    .max(60),
  file: z
    .object({
      name: z.string().trim().min(1).max(200),
      format: z.enum(["docx", "xlsx", "pdf", "pptx"]),
      base64: z.string().min(1).max(7_200_000), // 5 MB file → ~6.8 MB of base64
    })
    .optional(),
});
export type ApplyInputT = z.input<typeof ApplyInput>;

export interface ApplyRow {
  projectId: string;
  code: string;
  /** What happened to the product's weekly line ("none" = no line given, delivery only). */
  outcome: "drafted" | "resent" | "sent" | "none" | "skipped" | "error";
  message?: string;
  attached: boolean;
  /** Market check-ins saved ("2 market check-ins saved: KE, RW"). */
  markets?: string | null;
  /** What the row did to the delivery gates ("MVP1 done · BRD in progress"). */
  gates?: string | null;
  /** What the row did to module states ("9 of 42 states updated"). */
  modules?: string | null;
  /** Changes that failed, one line each (the row still counts as applied). */
  problems?: string[];
}

/** The projects the viewer may fill from a report: the PM rule (lead or PM member), or
 * every active project for Heads / admins holding project:update. */
async function matchableProjects(ctx: TenantContext): Promise<MatchableProject[]> {
  const broad = can(ctx, "project:update") && !ctx.roles.includes("ProjectManager");
  return withTenant(ctx, (tx) =>
    tx.project.findMany({
      where: {
        status: { notIn: ["Completed", "Cancelled"] },
        ...(broad ? {} : runsProjectWhere(ctx.userId)),
      },
      select: { id: true, code: true, name: true, orgStatuses: { where: { retiredAt: null }, select: { orgUnitId: true, orgUnit: { select: { code: true, name: true } } } } },
      orderBy: { name: "asc" },
    }),
  ).then((rows) => rows.map(({ orgStatuses, ...p }) => ({ ...p, markets: orgStatuses.map((o) => ({ orgUnitId: o.orgUnitId, code: o.orgUnit.code, name: o.orgUnit.name })) })));
}

export async function previewStatusReport(ctx: TenantContext, buf: Buffer, fileName: string, week?: string | null, now = new Date()): Promise<UploadPreview> {
  const { isoWeek, past } = resolveReportWeek(week, now);
  const [report, projects] = await Promise.all([extractStatusReport(buf, fileName), matchableProjects(ctx)]);
  const sentIds = new Set(
    (
      await withTenant(ctx, (tx) =>
        tx.checkIn.findMany({ where: { isoWeek, status: "Confirmed", projectId: { in: projects.map((p) => p.id) } }, select: { projectId: true } }),
      )
    ).map((c) => c.projectId),
  );
  const catalogs: Record<string, DeliveryCatalog> = {};
  const computed: Record<string, Rag> = {};
  const rows: PreviewRow[] = [];
  const { at } = resolveReportWeek(week, now);
  for (const r of report.rows) {
    const match = matchProjectAndMarket(r.project, projects, { code: r.code, market: r.market });
    // A market one-pager writes the market's check-in: the product's sent state is moot.
    const alreadySent = Boolean(match.projectId && !match.orgUnitId && sentIds.has(match.projectId));
    let delivery: DeliveryPlan | null = null;
    if (match.projectId) {
      catalogs[match.projectId] ??= (await getDeliveryCatalog(ctx, match.projectId))!;
      computed[match.projectId] ??= (await getCurrentCheckIn(ctx, match.projectId, at)).computedRag;
      delivery = resolveDelivery(r, catalogs[match.projectId]!, match.orgUnitId ? { market: catalogs[match.projectId]!.markets.find((m) => m.orgUnitId === match.orgUnitId) ?? null } : {});
    }
    rows.push({ ...r, match, alreadySent, computedRag: match.projectId ? (computed[match.projectId] ?? null) : null, delivery, warnings: alreadySent ? [...r.warnings, "This week's update was already sent — tick Replace to resend it with this row."] : r.warnings });
  }
  return { format: report.format, preparedBy: report.preparedBy, reportDate: report.reportDate, isoWeek, past, rows, projects, catalogs, warnings: report.warnings };
}

const GATE_WORD: Record<CheckpointState, string> = { NotStarted: "not started", InProgress: "in progress", Done: "done", Blocked: "blocked" };

/** The ticked gate states, each tried without and then with the upload as the override
 * reason (a gate whose checklist is unmet closes with a written reason, docs/16 §6). */
async function applyGates(ctx: TenantContext, projectId: string, gates: { checkpointId: string; state: CheckpointState }[], scope: GateScope, reason: string, origin: StateOrigin): Promise<{ summary: string | null; problems: string[] }> {
  const done: string[] = [];
  const problems: string[] = [];
  for (const g of gates) {
    try {
      let cps;
      try {
        cps = await setCheckpointState(ctx, projectId, { checkpointId: g.checkpointId, state: g.state }, scope, origin);
      } catch (e) {
        if (!(e instanceof CheckpointError) || e.code !== "GATE_UNMET") throw e;
        cps = await setCheckpointState(ctx, projectId, { checkpointId: g.checkpointId, state: g.state, overrideReason: reason }, scope, origin);
      }
      const name = cps.rows.find((r) => r.checkpointId === g.checkpointId)?.name ?? "gate";
      done.push(`${name} ${GATE_WORD[g.state]}`);
    } catch (e) {
      problems.push(`Gate not moved: ${e instanceof Error ? e.message : "could not save"}`);
    }
  }
  return { summary: done.length ? done.join(" · ") : null, problems };
}

async function applyModules(ctx: TenantContext, projectId: string, modules: { moduleId: string; orgUnitId: string | null; state: InstanceState; note?: string | null }[], origin: StateOrigin): Promise<{ summary: string | null; problems: string[] }> {
  let ok = 0;
  const problems: string[] = [];
  for (const m of modules) {
    try {
      await setInstanceState(ctx, projectId, m.moduleId, { orgUnitId: m.orgUnitId, state: m.state, ...(m.note !== undefined ? { note: m.note } : {}) }, origin);
      ok++;
    } catch (e) {
      problems.push(`Module state not saved: ${e instanceof Error ? e.message : "could not save"}`);
    }
  }
  return { summary: ok ? `${ok} ${ok === 1 ? "state" : "states"} updated` : null, problems };
}

export async function applyStatusReport(ctx: TenantContext, raw: ApplyInputT, realNow = new Date()): Promise<ApplyRow[]> {
  const input = ApplyInput.parse(raw);
  const { isoWeek, at: now, past } = resolveReportWeek(input.week, realNow);
  const week = isoWeek.split("-W")[1];
  const dateLabel = realNow.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const reason = `From the status report uploaded ${dateLabel}${input.preparedBy ? ` (prepared by ${input.preparedBy})` : ""}`.slice(0, 300);
  // The stamp gates and module states carry: the report (its file name) and the week.
  const origin: StateOrigin = { source: `Status report · Week ${week}${input.file ? ` · ${input.file.name}` : ""}` };
  const projectsIn = await withTenant(ctx, (tx) =>
    tx.project.findMany({
      where: { id: { in: input.rows.map((r) => r.projectId) } },
      select: { id: true, code: true, orgStatuses: { where: { retiredAt: null }, select: { orgUnitId: true, orgUnit: { select: { code: true } } } } },
    }),
  );
  const codes = new Map(projectsIn.map((p) => [p.id, p.code]));
  const codesOfMarkets = new Map(projectsIn.flatMap((p) => p.orgStatuses.map((o) => [`${p.id}:${o.orgUnitId}`, o.orgUnit.code] as const)));
  const out: ApplyRow[] = [];
  for (const row of input.rows) {
    const code = codes.get(row.projectId);
    if (!code) {
      out.push({ projectId: row.projectId, code: "?", outcome: "error", message: "No such project.", attached: false });
      continue;
    }
    try {
      if (!(await canWriteProject(ctx, row.projectId))) {
        out.push({ projectId: row.projectId, code, outcome: "error", message: "You don't run this project.", attached: false });
        continue;
      }
      const problems: string[] = [];
      let outcome: ApplyRow["outcome"] = "none";
      let message: string | undefined;
      // ── the product's weekly line ──
      if (row.narrative) {
        const current = await getCurrentCheckIn(ctx, row.projectId, now);
        const rag = row.rag ?? current.computedRag;
        const override = rag !== current.computedRag ? { ragOverride: rag, overrideReason: reason } : {};
        if (past) {
          // A closed week has no queue: the review here is the review, so send now.
          if (current.status === "Confirmed" && !row.resend) {
            outcome = "skipped";
            message = `Week ${week} was already sent — tick Replace to resend it.`;
          } else {
            await confirmCheckIn(ctx, row.projectId, { narrative: row.narrative, ...override }, now);
            outcome = current.status === "Confirmed" ? "resent" : "sent";
          }
        } else if (current.status === "Confirmed") {
          if (!row.resend) {
            outcome = "skipped";
            message = "Already sent this week — tick Replace to resend it.";
          } else {
            // Recall: re-confirm = resend with the new line and RAG.
            await confirmCheckIn(ctx, row.projectId, { narrative: row.narrative, ...override }, now);
            outcome = "resent";
          }
        } else {
          await saveCheckInDraft(ctx, row.projectId, { narrative: row.narrative, ragOverride: rag, overrideReason: reason }, now);
          outcome = "drafted";
        }
      }
      if (row.stage) await updateProject(ctx, row.projectId, { statusNote: row.stage });
      // ── market check-ins ──
      let markets: string | null = null;
      if (row.markets?.length) {
        const saved: string[] = [];
        for (const m of row.markets) {
          const mc = codesOfMarkets.get(`${row.projectId}:${m.orgUnitId}`);
          try {
            await saveMarketCheckIn(ctx, row.projectId, m.orgUnitId, { narrative: m.narrative, rag: m.rag }, now);
            saved.push(mc ?? "?");
          } catch (e) {
            problems.push(`${mc ?? "Market"} check-in not saved: ${e instanceof Error ? e.message : "could not save"}`);
          }
        }
        markets = saved.length ? `${saved.length} market check-in${saved.length === 1 ? "" : "s"} saved: ${saved.join(", ")}` : null;
      }
      // ── gates, per scope (product = every market; a market = its own copy) ──
      let gates: string | null = null;
      if (row.gates?.length) {
        const byScope = new Map<string | null, { checkpointId: string; state: CheckpointState }[]>();
        for (const g of row.gates) byScope.set(g.orgUnitId ?? null, [...(byScope.get(g.orgUnitId ?? null) ?? []), { checkpointId: g.checkpointId, state: g.state }]);
        const parts: string[] = [];
        for (const [unit, list] of byScope) {
          const g = await applyGates(ctx, row.projectId, list, unit ? { orgUnitId: unit } : { allMarkets: true }, reason, origin);
          if (g.summary) parts.push(unit ? `${codesOfMarkets.get(`${row.projectId}:${unit}`) ?? "market"}: ${g.summary}` : g.summary);
          problems.push(...g.problems);
        }
        gates = parts.length ? parts.join(" · ") : null;
      }
      // ── module states ──
      let modules: string | null = null;
      if (row.modules?.length) {
        const m = await applyModules(ctx, row.projectId, row.modules, origin);
        modules = m.summary;
        problems.push(...m.problems);
      }
      // ── the file, once per project, when something was applied ──
      let attached = false;
      const applied = outcome === "drafted" || outcome === "resent" || outcome === "sent" || markets || gates || modules;
      if (input.file && applied) {
        await createDocument(ctx, row.projectId, {
          title: `Status report · Week ${week}${input.preparedBy ? ` · ${input.preparedBy}` : ""}`,
          kind: "Other",
          format: input.file.format,
          fileData: input.file.base64,
          source: "Uploaded",
        });
        attached = true;
      }
      out.push({ projectId: row.projectId, code, outcome, message, attached, markets, gates, modules, problems });
    } catch (e) {
      out.push({ projectId: row.projectId, code, outcome: "error", message: e instanceof Error ? e.message : "Could not apply.", attached: false });
    }
  }
  return out;
}

/**
 * A report row for a project QUBIT doesn't have yet: create it from the row (the uploader
 * becomes its PM, the tenant's first live gate template its track) so the row can land.
 * Needs project:create — the same right as the New project dialog.
 */
export async function createProjectFromReport(ctx: TenantContext, name: string): Promise<{ id: string; code: string; name: string }> {
  if (!can(ctx, "project:create")) throw new UploadWeekError("You can't create projects.");
  const clean = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!clean) throw new UploadWeekError("The row has no project name.");
  const project = await createProject(ctx, { name: clean, type: "Project", priority: "Med", status: "Planning", leadUserId: ctx.userId });
  const template = (await listCheckpointTemplates(ctx))[0];
  if (template) await setProjectTemplate(ctx, project.id, template.id);
  return { id: project.id, code: project.code, name: project.name };
}

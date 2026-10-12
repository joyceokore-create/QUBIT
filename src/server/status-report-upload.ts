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
import { GATE_STATE_LABEL, MODULE_STATE_LABEL, resolveDelivery, type DeliveryCatalog, type DeliveryPlan } from "@/lib/status-report-delivery";
import { writeZip } from "@/lib/zip-write";

/**
 * Status-report upload (Reports › This week). Two steps, both through the engines the
 * workspace already uses: PREVIEW parses the file and matches rows to the viewer's own
 * projects (nothing written); APPLY fills each chosen project's weekly draft
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

export const ApplyInput = z.object({
  /** ISO week the report is for (default: this week). */
  week: z.string().regex(/^\d{4}-W\d{2}$/).optional(),
  preparedBy: z.string().trim().max(120).nullable().optional(),
  reportDate: z.string().trim().max(40).nullable().optional(),
  rows: z
    .array(
      z.object({
        projectId: z.string().uuid(),
        rag: z.enum(RAGS),
        stage: z.string().trim().max(STAGE_MAX).optional().default(""),
        narrative: z.string().trim().min(1).max(NARRATIVE_MAX),
        /** Replace an already-sent week with this row and resend it. */
        resend: z.boolean().optional(),
        /** "market": the row is one market's one-pager → that market's check-in, not the
         * product's update (orgUnitId required). */
        target: z.enum(["project", "market"]).optional().default("project"),
        orgUnitId: z.string().uuid().nullable().optional(),
        /** Gate states the PM ticked, written on the product track (every market at
         * product level) or on the named market's copy. */
        gates: z.array(z.object({ checkpointId: z.string().min(1), state: z.enum(CHECKPOINT_STATES) })).max(40).optional(),
        /** Module states per market the PM ticked. */
        modules: z
          .array(z.object({ moduleId: z.string().min(1), orgUnitId: z.string().uuid().nullable(), state: z.enum(INSTANCE_STATES), note: z.string().trim().max(200).nullable().optional() }))
          .max(400)
          .optional(),
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
  /** "market": the market's check-in was saved (the product's update untouched). */
  outcome: "drafted" | "resent" | "sent" | "market" | "skipped" | "error";
  message?: string;
  attached: boolean;
  /** The market the row was about, when it was one market's one-pager. */
  market?: string | null;
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
      const marketCode = row.orgUnitId ? codesOfMarkets.get(`${row.projectId}:${row.orgUnitId}`) ?? null : null;
      const problems: string[] = [];
      const scope: GateScope = row.orgUnitId ? { orgUnitId: row.orgUnitId } : { allMarkets: true };
      if (row.target === "market") {
        if (!row.orgUnitId || !marketCode) {
          out.push({ projectId: row.projectId, code, outcome: "error", message: "Pick the market this one-pager is about.", attached: false });
          continue;
        }
        // One market's one-pager: its check-in (RAG + narrative), its copy of the gates,
        // its module states. The product's weekly update is the product deck's to fill.
        await saveMarketCheckIn(ctx, row.projectId, row.orgUnitId, { narrative: row.narrative, rag: row.rag }, now);
        const g = row.gates?.length ? await applyGates(ctx, row.projectId, row.gates, scope, reason, origin) : { summary: null, problems: [] };
        const m = row.modules?.length ? await applyModules(ctx, row.projectId, row.modules, origin) : { summary: null, problems: [] };
        let attached = false;
        if (input.file) {
          await createDocument(ctx, row.projectId, {
            title: `Status report · Week ${week} · ${marketCode}${input.preparedBy ? ` · ${input.preparedBy}` : ""}`,
            kind: "Other",
            format: input.file.format,
            fileData: input.file.base64,
            source: "Uploaded",
          });
          attached = true;
        }
        out.push({ projectId: row.projectId, code, outcome: "market", attached, market: marketCode, gates: g.summary, modules: m.summary, problems: [...g.problems, ...m.problems] });
        continue;
      }
      const current = await getCurrentCheckIn(ctx, row.projectId, now);
      let outcome: ApplyRow["outcome"] = "drafted";
      if (past) {
        // A closed week has no queue: the dialog's review is the review, so send now.
        if (current.status === "Confirmed" && !row.resend) {
          out.push({ projectId: row.projectId, code, outcome: "skipped", message: `Week ${week} was already sent — tick Replace to resend it.`, attached: false });
          continue;
        }
        await confirmCheckIn(ctx, row.projectId, { narrative: row.narrative, ...(row.rag !== current.computedRag ? { ragOverride: row.rag, overrideReason: reason } : {}) }, now);
        outcome = current.status === "Confirmed" ? "resent" : "sent";
      } else if (current.status === "Confirmed") {
        if (!row.resend) {
          out.push({ projectId: row.projectId, code, outcome: "skipped", message: "Already sent this week — tick Replace to resend it.", attached: false });
          continue;
        }
        // Recall by upload: re-confirm = resend with the new line and RAG.
        await confirmCheckIn(ctx, row.projectId, { narrative: row.narrative, ...(row.rag !== current.computedRag ? { ragOverride: row.rag, overrideReason: reason } : {}) }, now);
        outcome = "resent";
      } else {
        await saveCheckInDraft(ctx, row.projectId, { narrative: row.narrative, ragOverride: row.rag, overrideReason: reason }, now);
      }
      let gates: string | null = null;
      if (row.stage) await updateProject(ctx, row.projectId, { statusNote: row.stage });
      if (row.gates?.length) {
        const g = await applyGates(ctx, row.projectId, row.gates, scope, reason, origin);
        gates = g.summary;
        problems.push(...g.problems);
      }
      let modules: string | null = null;
      if (row.modules?.length) {
        const m = await applyModules(ctx, row.projectId, row.modules, origin);
        modules = m.summary;
        problems.push(...m.problems);
      }
      let attached = false;
      if (input.file) {
        await createDocument(ctx, row.projectId, {
          title: `Status report · Week ${week}${input.preparedBy ? ` · ${input.preparedBy}` : ""}`,
          kind: "Other",
          format: input.file.format,
          fileData: input.file.base64,
          source: "Uploaded",
        });
        attached = true;
      }
      out.push({ projectId: row.projectId, code, outcome, attached, market: marketCode, gates, modules, problems });
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

// ── QUBIT's own template: an Excel workbook the PM fills and uploads back ─────────────
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colRef = (i: number) => {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};
function sheetXml(rows: string[][], widths: number[]): string {
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const body = rows
    .map((cells, r) => `<row r="${r + 1}">${cells.map((v, c) => (v === "" ? "" : `<c r="${colRef(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`)).join("")}</row>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

/**
 * This week's template for the viewer's projects, prefilled from QUBIT: sheet "Status" —
 * Code · Project · Market · RAG · one column per gate · Current stage · Update and Outlook
 * (one row per product, then one per market); sheet "Channels" — Code · Project · Market ·
 * Channel · State · Note. Codes make the upload exact; the gate and state words are the
 * ones the upload reads back.
 */
export async function buildStatusTemplate(ctx: TenantContext, now = new Date()): Promise<{ fileName: string; xlsx: Buffer }> {
  const projects = await matchableProjects(ctx);
  const isoWeek = isoWeekId(now);
  const catalogs = await Promise.all(projects.map((p) => getDeliveryCatalog(ctx, p.id)));
  const gateNames: string[] = [];
  for (const c of catalogs) for (const g of c?.gates ?? []) if (!gateNames.includes(g.name)) gateNames.push(g.name);
  const extra = await withTenant(ctx, async (tx) => {
    const ids = projects.map((p) => p.id);
    const [notes, checkIns, marketCheckIns] = await Promise.all([
      tx.project.findMany({ where: { id: { in: ids } }, select: { id: true, statusNote: true } }),
      tx.checkIn.findMany({ where: { projectId: { in: ids }, isoWeek }, select: { projectId: true, narrative: true, ragOverride: true, computedRag: true } }),
      tx.marketCheckIn.findMany({ where: { projectId: { in: ids }, isoWeek }, select: { projectId: true, orgUnitId: true, narrative: true, rag: true } }),
    ]);
    return { notes: new Map(notes.map((n) => [n.id, n.statusNote ?? ""])), checkIns: new Map(checkIns.map((c) => [c.projectId, c])), market: new Map(marketCheckIns.map((c) => [`${c.projectId}:${c.orgUnitId}`, c])) };
  });
  const header = ["Code", "Project", "Market", "RAG", ...gateNames, "Current stage", "Update and Outlook"];
  const status: string[][] = [header];
  const channels: string[][] = [["Code", "Project", "Market", "Channel", "State", "Note"]];
  projects.forEach((p, i) => {
    const c = catalogs[i];
    const ci = extra.checkIns.get(p.id);
    const gateCells = (unit: string | null) => gateNames.map((name) => {
      const g = c?.gates.find((x) => x.name === name);
      if (!g) return "";
      return GATE_STATE_LABEL[c?.gateStates.find((s) => s.orgUnitId === unit && s.checkpointId === g.checkpointId)?.state ?? "NotStarted"];
    });
    status.push([p.code, p.name, "", ci?.ragOverride ?? ci?.computedRag ?? "", ...gateCells(null), extra.notes.get(p.id) ?? "", ci?.narrative ?? ""]);
    for (const mk of c?.markets ?? []) {
      const mc = extra.market.get(`${p.id}:${mk.orgUnitId}`);
      status.push([p.code, p.name, mk.code, mc?.rag ?? "", ...gateCells(mk.orgUnitId), "", mc?.narrative ?? ""]);
      for (const mod of c?.modules ?? []) {
        const st = c?.moduleStates.find((s) => s.moduleId === mod.id && s.orgUnitId === mk.orgUnitId);
        channels.push([p.code, p.name, mk.code, mod.name, MODULE_STATE_LABEL[st?.state ?? "Planned"], st?.note ?? ""]);
      }
    }
    if (!c?.markets.length) for (const mod of c?.modules ?? []) {
      const st = c?.moduleStates.find((s) => s.moduleId === mod.id && s.orgUnitId === null);
      channels.push([p.code, p.name, "", mod.name, MODULE_STATE_LABEL[st?.state ?? "Planned"], st?.note ?? ""]);
    }
  });
  const readme: string[][] = [
    ["QUBIT status report template", ""],
    ["Week", `${isoWeek} — upload this file under Reports › This week`],
    ["Status sheet", "One row per project, then one per market (Market column). Set RAG to Green / Amber / Red, each gate to Done / In progress / Not started / n/a, write the stage and the update. Leave a cell blank to leave it alone."],
    ["Channels sheet", "One row per channel × market. State: Planned / Build / UAT / Live / N/A. The note is optional."],
    ["Rules", "Keep the Code column: it makes the match exact. Rows with a Market go to that market's check-in; the product row goes to the Head. Nothing is sent until you review and send in QUBIT."],
  ];
  const sheets: { name: string; xml: string }[] = [
    { name: "Status", xml: sheetXml(status, [10, 28, 8, 8, ...gateNames.map(() => 13), 28, 60]) },
    ...(channels.length > 1 ? [{ name: "Channels", xml: sheetXml(channels, [10, 28, 8, 22, 10, 40]) }] : []),
    { name: "Read me", xml: sheetXml(readme, [18, 110]) },
  ];
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${xmlEsc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/></cellXfs></styleSheet>`,
  };
  sheets.forEach((sh, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sh.xml;
  });
  return { fileName: `qubit-status-report-${isoWeek}.xlsx`, xlsx: writeZip(files) };
}

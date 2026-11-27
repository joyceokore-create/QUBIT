import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { canWriteProject } from "@/lib/access";
import { can } from "@/lib/rbac";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createBlocker } from "@/server/blockers";
import { createRisk } from "@/server/risks";
import { isoWeekId, isoWeekMonday, isValidIsoWeek } from "@/lib/iso-week";
import { PM_SELECT, pmIdsOf, runsProjectWhere } from "@/lib/ownership";
import { emitDomainEvent } from "@/server/events";

import { confirmCheckIn, getCurrentCheckIn, RAGS, saveCheckInDraft } from "@/server/checkins";
import { CHECKPOINT_STATES, CheckpointError, listCheckpointTemplates, setCheckpointState, setProjectTemplate, type CheckpointState, type GateScope, type StateOrigin } from "@/server/checkpoints";
import { createDocument } from "@/server/documents";
import type { Rag } from "@/server/health";
import { INSTANCE_STATES, setInstanceState, type InstanceState } from "@/server/project-instances";
import { createProject, updateProject } from "@/server/projects";
import { saveMarketCheckIn } from "@/server/rollout";
import { extractStatusReport, NARRATIVE_MAX, STAGE_MAX, type ParsedRow, type ReportFormat } from "@/server/status-report/parse";
import { extractWithLumi, LumiExtractError, lumiReaderAvailable } from "@/server/status-report/lumi-extract";
import { matchProjectAndMarket, type MatchableProject, type RowMatch } from "@/server/status-report/match";
import { resolveDelivery, type DeliveryCatalog, type DeliveryPlan } from "@/lib/status-report-delivery";
import { requiresSignOff } from "@/lib/gate-approval";

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

/** /apply named an upload this person didn't make (or one that was purged). */
export class UploadNotFoundError extends Error {
  constructor() {
    super("That upload wasn't found. Upload the file again.");
    this.name = "UploadNotFoundError";
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
  /** Phase 2: the line names (exactly) a project somebody ELSE runs — who that is. The
   * uploader can send it to them; it never writes to their project from here. */
  owner: { userId: string; name: string } | null;
}

export interface UploadPreview {
  /** The stored upload: /apply names this instead of sending the file back. */
  uploadId: string;
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
  /** Who read the lines: QUBIT's rules, or Lumi AI (plan Phase 3) — the drawer badges Lumi's. */
  extractor: "rules" | "lumi";
}

/** One project's delivery, as the resolver needs it: markets, modules, gates and the
 * current states of each (product track + every market's copy; module × market). */
export async function getDeliveryCatalog(ctx: TenantContext, projectId: string): Promise<DeliveryCatalog | null> {
  return withTenant(ctx, async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        id: true, code: true, name: true, moduleLabel: true,
        checkpointTemplate: { select: { name: true, checkpoints: { select: { id: true, name: true, orderIndex: true, requiresApproval: true }, orderBy: { orderIndex: "asc" } } } },
        orgStatuses: { where: { retiredAt: null }, select: { orgUnitId: true, orgUnit: { select: { code: true, name: true, flag: true } } }, orderBy: { orgUnit: { code: "asc" } } },
        modules: { select: { id: true, name: true, code: true, kind: true }, orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!project) return null;
    const [gateStates, moduleStates] = await Promise.all([
      tx.checkpointStatus.findMany({ where: { projectId, moduleId: null }, select: { orgUnitId: true, checkpointId: true, state: true, approval: true } }),
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
      // WS1: a sign-off gate the report calls done is SUBMITTED, and the cascade stops there.
      gates: project.checkpointTemplate?.checkpoints.map((c) => ({ checkpointId: c.id, name: c.name, orderIndex: c.orderIndex, signOff: requiresSignOff(c) })) ?? [],
      gateStates: gateStates.map((g) => ({ orgUnitId: g.orgUnitId, checkpointId: g.checkpointId, state: g.state as CheckpointState, approval: g.approval })),
      moduleStates: moduleStates.map((m) => ({ moduleId: m.moduleId, orgUnitId: m.orgUnitId, state: m.state as InstanceState, note: m.note })),
      stageTerms: await tx.stageTerm.findMany({ select: { term: true, gateName: true }, orderBy: { term: "asc" } }),
    };
  });
}

/** docs/38 — the tenant's stage vocabulary, learned from the workspace's clarifier. */
export const StageTermInput = z.object({
  term: z.string().trim().min(3).max(60),
  /** A gate name on the Product build track; null forgets the term. */
  gateName: z.string().trim().min(1).max(60).nullable(),
});
export async function saveStageTerm(ctx: TenantContext, input: z.infer<typeof StageTermInput>): Promise<{ term: string; gateName: string | null }> {
  const term = input.term.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (term.length < 3) throw new UploadWeekError("Give a phrase of at least three letters.");
  return withTenant(ctx, async (tx) => {
    const existing = await tx.stageTerm.findUnique({ where: { tenantId_term: { tenantId: ctx.tenantId, term } }, select: { id: true, gateName: true } });
    if (!input.gateName) {
      if (existing) {
        await tx.stageTerm.delete({ where: { id: existing.id } });
        await audit(tx, ctx, { action: "delete", entityType: "stage_term", entityId: existing.id, before: { term, gateName: existing.gateName } });
      }
      return { term, gateName: null };
    }
    const row = existing
      ? await tx.stageTerm.update({ where: { id: existing.id }, data: { gateName: input.gateName, createdById: ctx.userId } })
      : await tx.stageTerm.create({ data: { tenantId: ctx.tenantId, term, gateName: input.gateName, createdById: ctx.userId } });
    await audit(tx, ctx, { action: existing ? "update" : "create", entityType: "stage_term", entityId: row.id, before: existing ? { gateName: existing.gateName } : undefined, after: { term, gateName: input.gateName } });
    return { term, gateName: input.gateName };
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
  /** Phase 2: lines a colleague's report sent to this project, waiting for its PM. */
  routed: RoutedLine[];
}

/** A line from someone else's status report, sent to the PM who runs the project. */
export interface RoutedLine {
  rowId: string;
  line: number;
  /** Who uploaded the report. */
  from: string;
  fileName: string;
  sentAt: Date;
  row: ParsedRow;
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
    const [notes, marketCheckIns, routedRows] = await Promise.all([
      tx.project.findMany({ where: { id: { in: ids } }, select: { id: true, statusNote: true } }),
      tx.marketCheckIn.findMany({ where: { projectId: { in: ids }, isoWeek }, select: { projectId: true, orgUnitId: true, narrative: true, rag: true } }),
      tx.statusUploadRow.findMany({
        where: { projectId: { in: ids }, state: "routed", upload: { isoWeek } },
        select: { id: true, line: true, parsed: true, projectId: true, updatedAt: true, upload: { select: { fileName: true, uploadedBy: { select: { name: true } } } } },
        orderBy: { updatedAt: "asc" },
      }),
    ]);
    const routed = new Map<string, RoutedLine[]>();
    for (const r of routedRows) {
      const list = routed.get(r.projectId!) ?? [];
      list.push({ rowId: r.id, line: r.line, from: r.upload.uploadedBy?.name ?? "A colleague", fileName: r.upload.fileName, sentAt: r.updatedAt, row: r.parsed as unknown as ParsedRow });
      routed.set(r.projectId!, list);
    }
    return { notes: new Map(notes.map((n) => [n.id, n.statusNote ?? ""])), market: new Map(marketCheckIns.map((c) => [`${c.projectId}:${c.orgUnitId}`, c])), routed };
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
      routed: extra.routed.get(p.id) ?? [],
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
        /** The PM's own reason when they chose a rating that differs from QUBIT's (UX fidelity);
         * absent = the rating came from the file, whose reason is used. */
        ratingReason: z.string().trim().min(5).max(300).optional(),
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
        /** The upload's lines this row came from, so the upload records what became of them. */
        lines: z.array(z.number().int().min(0)).max(200).optional(),
        /** Phase 2: lines a colleague sent to this project that the PM used for this row. */
        routedRowIds: z.array(z.string().uuid()).max(20).optional(),
        /** Risks and issues the file listed that the PM chose to record (never automatic). */
        raid: z.array(z.object({ kind: z.enum(["risk", "blocker"]), text: z.string().trim().min(3).max(200) })).max(20).optional(),
      }),
    )
    .min(1)
    .max(60),
  /** The upload these rows came from (from the preview). The file is never sent back. */
  uploadId: z.string().uuid().optional(),
  /** Attach the upload's file to each project something was applied to. */
  attach: z.boolean().optional(),
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
  /** Risks and blockers raised from the file's lines ("1 risk and 1 blocker raised"). */
  raid?: string | null;
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

/** Phase 2 — active projects somebody else runs, with who runs them (lead first), so a line
 * naming one can be sent to its PM. Detection only: nothing here grants a write. */
async function othersProjects(ctx: TenantContext, ownIds: string[]): Promise<(MatchableProject & { owner: { userId: string; name: string } })[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.project.findMany({
      where: { status: { notIn: ["Completed", "Cancelled"] }, id: { notIn: ownIds } },
      select: { id: true, code: true, name: true, ...PM_SELECT, orgStatuses: { where: { retiredAt: null }, select: { orgUnitId: true, leadUserId: true, orgUnit: { select: { code: true, name: true } } } } },
    });
    const ownerIds = new Map(rows.map((r) => [r.id, pmIdsOf(r).find((id) => id !== ctx.userId) ?? null]));
    const users = await tx.user.findMany({ where: { id: { in: [...new Set([...ownerIds.values()].filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } });
    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    return rows.flatMap((r) => {
      const ownerId = ownerIds.get(r.id);
      // Nobody runs it: there's no one to send the line to, so it stays an open question.
      if (!ownerId) return [];
      return [{ id: r.id, code: r.code, name: r.name, markets: r.orgStatuses.map((o) => ({ orgUnitId: o.orgUnitId, code: o.orgUnit.code, name: o.orgUnit.name })), owner: { userId: ownerId, name: nameOf.get(ownerId) ?? "its PM" } }];
    });
  });
}

/**
 * Who reads the file: the rules always run first. Lumi reads it when the PM asks ("lumi") or
 * when the rules found no lines (prose, a scan) and Lumi is connected. If Lumi can't, the
 * rules' result stands with Lumi's reason as a warning — the upload never fails on Lumi.
 */
async function readReport(ctx: TenantContext, buf: Buffer, fileName: string, reader: "auto" | "lumi") {
  const rules = await extractStatusReport(buf, fileName);
  if (reader !== "lumi" && rules.rows.length > 0) return { report: rules, extractor: "rules" as const, runId: null };
  if (!(await lumiReaderAvailable(ctx))) {
    const note = reader === "lumi" ? ["Lumi isn't connected, so QUBIT read the file with its rules."] : [];
    return { report: { ...rules, warnings: [...rules.warnings, ...note] }, extractor: "rules" as const, runId: null };
  }
  try {
    const lumi = await extractWithLumi(ctx, { buf, fileName, format: rules.format });
    if (lumi.rows.length === 0) return { report: { ...rules, warnings: [...rules.warnings, "Lumi found no project lines in the file either."] }, extractor: "rules" as const, runId: null };
    return { report: { ...rules, rows: lumi.rows, warnings: ["Read by Lumi AI — check each line before you apply it.", ...lumi.warnings] }, extractor: "lumi" as const, runId: lumi.runId };
  } catch (e) {
    if (!(e instanceof LumiExtractError)) throw e;
    return { report: { ...rules, warnings: [...rules.warnings, `Lumi: ${e.message}`] }, extractor: "rules" as const, runId: null };
  }
}

export async function previewStatusReport(ctx: TenantContext, buf: Buffer, fileName: string, week?: string | null, now = new Date(), reader: "auto" | "lumi" = "auto"): Promise<UploadPreview> {
  const { isoWeek, past } = resolveReportWeek(week, now);
  const [{ report, extractor, runId }, projects] = await Promise.all([readReport(ctx, buf, fileName, reader), matchableProjects(ctx)]);
  // Only an EXACT name or code for someone else's project is offered for sending; a fuzzy
  // guess never routes a line to a colleague. Own projects are matched first, as before.
  const others = await othersProjects(ctx, projects.map((p) => p.id));
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
    let match = matchProjectAndMarket(r.project, projects, { code: r.code, market: r.market });
    let owner: PreviewRow["owner"] = null;
    if (match.confidence !== "exact" && others.length) {
      const theirs = matchProjectAndMarket(r.project, others, { code: r.code, market: r.market });
      const project = theirs.confidence === "exact" ? others.find((o) => o.id === theirs.projectId) : undefined;
      if (project) {
        match = theirs;
        owner = project.owner;
      }
    }
    // A market one-pager writes the market's check-in: the product's sent state is moot.
    const alreadySent = Boolean(match.projectId && !owner && !match.orgUnitId && sentIds.has(match.projectId));
    let delivery: DeliveryPlan | null = null;
    if (match.projectId && !owner) {
      catalogs[match.projectId] ??= (await getDeliveryCatalog(ctx, match.projectId))!;
      computed[match.projectId] ??= (await getCurrentCheckIn(ctx, match.projectId, at)).computedRag;
      delivery = resolveDelivery(r, catalogs[match.projectId]!, match.orgUnitId ? { market: catalogs[match.projectId]!.markets.find((m) => m.orgUnitId === match.orgUnitId) ?? null } : {});
    }
    rows.push({ ...r, match, owner, alreadySent, computedRag: match.projectId && !owner ? (computed[match.projectId] ?? null) : null, delivery, warnings: alreadySent ? [...r.warnings, "This week's update was already sent — tick Replace to resend it with this row."] : r.warnings });
  }
  const uploadId = await recordUpload(ctx, { buf, fileName, format: report.format, isoWeek, rows, extractor, extractorRunId: runId });
  return { uploadId, format: report.format, preparedBy: report.preparedBy, reportDate: report.reportDate, isoWeek, past, rows, projects, catalogs, warnings: report.warnings, extractor };
}

/** An unmatched line stays "unmatched"; a matched one (exact or suggested) waits as "pending". */
function rowState(match: RowMatch): "pending" | "unmatched" {
  return match.projectId ? "pending" : "unmatched";
}

/**
 * Keep the file once, server-side, with its parsed lines. Re-previewing the same file for
 * the same week replaces the earlier, never-applied preview instead of storing a copy.
 * The audit row carries counts only — never the file's content.
 */
export async function recordUpload(
  ctx: TenantContext,
  input: { buf: Buffer; fileName: string; format: ReportFormat; isoWeek: string; rows: (ParsedRow & { match: RowMatch; owner?: PreviewRow["owner"] })[]; extractor?: "rules" | "lumi"; extractorRunId?: string | null },
): Promise<string> {
  const sha256 = createHash("sha256").update(input.buf).digest("hex");
  const fileName = input.fileName.slice(0, 200);
  return withTenant(ctx, async (tx) => {
    const previous = await tx.statusUpload.findFirst({
      where: { uploadedById: ctx.userId, sha256, isoWeek: input.isoWeek, status: "previewed" },
      select: { id: true },
    });
    const upload = previous
      ? await tx.statusUpload.update({ where: { id: previous.id }, data: { fileName, extractor: input.extractor ?? "rules", extractorRunId: input.extractorRunId ?? null }, select: { id: true } })
      : await tx.statusUpload.create({
          data: {
            tenantId: ctx.tenantId,
            uploadedById: ctx.userId,
            fileName,
            format: input.format,
            sizeBytes: input.buf.length,
            sha256,
            fileData: input.buf.toString("base64"),
            isoWeek: input.isoWeek,
            extractor: input.extractor ?? "rules",
            extractorRunId: input.extractorRunId ?? null,
          },
          select: { id: true },
        });
    if (previous) await tx.statusUploadRow.deleteMany({ where: { uploadId: upload.id } });
    if (input.rows.length) {
      await tx.statusUploadRow.createMany({
        // Keep the parsed line only — not the preview's view of the project (delivery, RAG).
        data: input.rows.map(({ match, owner, ...rest }) => {
          const { alreadySent: _a, computedRag: _c, delivery: _d, ...row } = rest as typeof rest & Partial<Pick<PreviewRow, "alreadySent" | "computedRag" | "delivery">>;
          return {
          tenantId: ctx.tenantId,
          uploadId: upload.id,
          line: row.line,
          parsed: row as unknown as Prisma.InputJsonValue,
          projectId: match.projectId,
          matchConfidence: match.confidence,
          ownerUserId: owner?.userId ?? null,
          state: rowState(match),
          };
        }),
        skipDuplicates: true,
      });
    }
    await audit(tx, ctx, {
      action: previous ? "update" : "create",
      entityType: "status_upload",
      entityId: upload.id,
      after: { format: input.format, sizeBytes: input.buf.length, isoWeek: input.isoWeek, rows: input.rows.length, matched: input.rows.filter((r) => r.match.projectId).length },
    });
    return upload.id;
  });
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
      const row = cps.rows.find((r) => r.checkpointId === g.checkpointId);
      const name = row?.name ?? "gate";
      // WS1: a sign-off gate the report calls done was submitted for sign-off, not closed.
      done.push(g.state === "Done" && row?.signOff && row.state !== "Done" ? `${name} submitted for sign-off` : `${name} ${GATE_WORD[g.state]}`);
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
  // The upload is looked up as the uploader's own — another person's id answers "not found".
  const upload = input.uploadId
    ? await withTenant(ctx, (tx) =>
        tx.statusUpload.findFirst({ where: { id: input.uploadId, uploadedById: ctx.userId }, select: { id: true, fileName: true, format: true, isoWeek: true } }),
      )
    : null;
  if (input.uploadId && !upload) throw new UploadNotFoundError();
  if (upload && input.week && input.week !== upload.isoWeek) throw new UploadWeekError(`This file was read for week ${upload.isoWeek.split("-W")[1]}. Upload it again to use it for another week.`);
  const { isoWeek, at: now, past } = resolveReportWeek(input.week ?? upload?.isoWeek, realNow);
  const week = isoWeek.split("-W")[1];
  const dateLabel = realNow.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const reason = `From the status report uploaded ${dateLabel}${input.preparedBy ? ` (prepared by ${input.preparedBy})` : ""}`.slice(0, 300);
  // The stamp gates and module states carry: the report (its file name) and the week.
  const origin: StateOrigin = { source: `Status report · Week ${week}${upload ? ` · ${upload.fileName}` : ""}` };
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
        const why = row.ratingReason ?? reason;
        const override = rag !== current.computedRag ? { ragOverride: rag, overrideReason: why } : {};
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
          await saveCheckInDraft(ctx, row.projectId, { narrative: row.narrative, ragOverride: rag, overrideReason: why }, now);
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
      // ── risks and blockers the PM picked from the file's lines ──
      let raid: string | null = null;
      if (row.raid?.length) {
        const r = await applyRaid(ctx, row.projectId, row.raid, week);
        raid = r.summary;
        problems.push(...r.problems);
      }
      // ── the file, once per project, when something was applied ──
      let attached = false;
      const applied = outcome === "drafted" || outcome === "resent" || outcome === "sent" || markets || gates || modules || raid;
      if (upload && input.attach && applied) {
        // One copy of the file: the document points at the upload rather than holding it.
        await createDocument(
          ctx,
          row.projectId,
          { title: `Status report · Week ${week}${input.preparedBy ? ` · ${input.preparedBy}` : ""}`, kind: "Other", format: upload.format as ReportFormat, source: "Uploaded" },
          { statusUploadId: upload.id },
        );
        attached = true;
      }
      if (upload && applied) await markRowsApplied(ctx, upload.id, row.projectId, row.lines, isoWeek, realNow);
      if (row.routedRowIds?.length && applied) {
        const took = await acceptRoutedLines(ctx, row.projectId, row.routedRowIds, isoWeek, week, realNow);
        if (took.attached) attached = true;
      }
      out.push({ projectId: row.projectId, code, outcome, message, attached, markets, gates, modules, raid, problems });
    } catch (e) {
      out.push({ projectId: row.projectId, code, outcome: "error", message: e instanceof Error ? e.message : "Could not apply.", attached: false });
    }
  }
  if (upload) await settleUpload(ctx, upload.id, realNow);
  return out;
}

/**
 * Record the file's risk and issue lines the PM chose: a risk (probability and impact 3 of 5,
 * for the PM to rate on the RAID log) or a blocker (Medium). An open risk with the same title,
 * or an open blocker with the same description, on the project is not raised twice — re-saving
 * a card never duplicates. Each record is audited by createRisk / createBlocker.
 */
async function applyRaid(ctx: TenantContext, projectId: string, items: { kind: "risk" | "blocker"; text: string }[], week: string): Promise<{ summary: string | null; problems: string[] }> {
  const fold = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const open = await withTenant(ctx, async (tx) => ({
    risks: new Set((await tx.risk.findMany({ where: { projectId, status: { notIn: ["Closed"] } }, select: { title: true } })).map((r) => fold(r.title))),
    blockers: new Set((await tx.blocker.findMany({ where: { projectId, status: { notIn: ["Resolved"] } }, select: { description: true } })).map((b) => fold(b.description))),
  }));
  let risks = 0;
  let blockers = 0;
  let known = 0;
  const problems: string[] = [];
  for (const item of items) {
    const text = item.text.replace(/\s+/g, " ").trim().slice(0, 200);
    const seen = item.kind === "risk" ? open.risks : open.blockers;
    if (seen.has(fold(text))) {
      known++;
      continue;
    }
    try {
      if (item.kind === "risk") {
        await createRisk(ctx, { projectId, title: text, probability: 3, impact: 3, category: null, mitigation: `Raised from the week ${week} status report — rate it on the RAID log.` });
        risks++;
      } else {
        await createBlocker(ctx, projectId, { description: text, severity: "Medium" });
        blockers++;
      }
      seen.add(fold(text));
    } catch (e) {
      problems.push(`${item.kind === "risk" ? "Risk" : "Blocker"} "${text.slice(0, 40)}" not raised: ${e instanceof Error ? e.message : "could not save"}`);
    }
  }
  const parts = [risks ? `${risks} risk${risks === 1 ? "" : "s"}` : "", blockers ? `${blockers} blocker${blockers === 1 ? "" : "s"}` : ""].filter(Boolean);
  const summary = parts.length ? `${parts.join(" and ")} raised${known ? ` (${known} already open)` : ""}` : known ? `${known} already open` : null;
  return { summary, problems };
}

/** The upload's lines a row came from become "applied_by_uploader", linked to the week's check-in.
 * Without line numbers (an older client), the project's still-pending lines are the ones. */
async function markRowsApplied(ctx: TenantContext, uploadId: string, projectId: string, lines: number[] | undefined, isoWeek: string, now: Date): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const checkIn = await tx.checkIn.findFirst({ where: { projectId, isoWeek }, select: { id: true } });
    await tx.statusUploadRow.updateMany({
      where: { uploadId, ...(lines?.length ? { line: { in: lines } } : { projectId, state: "pending" }) },
      data: { state: "applied_by_uploader", projectId, appliedCheckInId: checkIn?.id ?? null, appliedAt: now },
    });
  });
}

/** After an apply: "applied" once no matched line is left waiting, else "partially_applied". */
async function settleUpload(ctx: TenantContext, uploadId: string, now: Date): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const [applied, waiting] = await Promise.all([
      tx.statusUploadRow.count({ where: { uploadId, state: { in: ["applied_by_uploader", "accepted"] } } }),
      tx.statusUploadRow.count({ where: { uploadId, state: { in: ["pending", "routed"] } } }),
    ]);
    if (applied === 0) return;
    const status = waiting === 0 ? "applied" : "partially_applied";
    await tx.statusUpload.update({ where: { id: uploadId }, data: { status, appliedAt: now } });
    await audit(tx, ctx, { action: "update", entityType: "status_upload", entityId: uploadId, after: { status, applied, waiting } });
  });
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


// ── Phase 2: lines for projects somebody else runs ────────────────────────────────────

/**
 * Send the uploader's chosen lines to the PMs who run those projects. Each line must be
 * the uploader's own upload, still pending, matched exactly to a project somebody else runs
 * (re-checked now — ownership may have changed since the preview). Nothing is written to the
 * project: the line waits on its PM's Weekly Update until they use or dismiss it.
 */
export async function routeUploadLines(ctx: TenantContext, uploadId: string, lines: number[]): Promise<{ routed: number; owners: string[] }> {
  return withTenant(ctx, async (tx) => {
    const upload = await tx.statusUpload.findFirst({ where: { id: uploadId, uploadedById: ctx.userId }, select: { id: true, fileName: true, isoWeek: true } });
    if (!upload) throw new UploadNotFoundError();
    if (!lines.length) return { routed: 0, owners: [] };
    const rows = await tx.statusUploadRow.findMany({
      where: { uploadId, line: { in: lines }, state: "pending", matchConfidence: "exact", ownerUserId: { not: null } },
      select: { id: true, ownerUserId: true, project: { select: { id: true, code: true, status: true, ...PM_SELECT } } },
    });
    const ok = rows.filter((r) => r.project && r.ownerUserId !== ctx.userId && !["Completed", "Cancelled"].includes(r.project.status) && pmIdsOf(r.project).includes(r.ownerUserId!));
    if (!ok.length) return { routed: 0, owners: [] };
    await tx.statusUploadRow.updateMany({ where: { id: { in: ok.map((r) => r.id) } }, data: { state: "routed" } });

    const codesBy = new Map<string, string[]>();
    for (const r of ok) codesBy.set(r.ownerUserId!, [...new Set([...(codesBy.get(r.ownerUserId!) ?? []), r.project!.code])]);
    const [me, owners] = await Promise.all([
      tx.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }),
      tx.user.findMany({ where: { id: { in: [...codesBy.keys()] } }, select: { id: true, name: true } }),
    ]);
    const from = me?.name ?? "A colleague";
    await emitDomainEvent(tx, ctx, {
      type: "status_upload.routed",
      entityType: "status_upload",
      entityId: upload.id,
      payload: { lines: ok.length, owners: codesBy.size },
      notify: [...codesBy].map(([userId, codes]) => ({
        userId,
        kind: "status_upload.routed",
        message: `${from} sent you ${codes.length === 1 ? "a line" : `${ok.filter((r) => r.ownerUserId === userId).length} lines`} from their status report for ${codes.join(", ")}. Use or dismiss it on your Weekly Update.`,
        link: `/reports/update?week=${upload.isoWeek}`,
      })),
    });
    await audit(tx, ctx, { action: "update", entityType: "status_upload", entityId: upload.id, after: { routed: ok.length, owners: codesBy.size } });
    return { routed: ok.length, owners: owners.map((o) => o.name) };
  });
}

/** The PM used routed lines on their card and saved: mark them accepted, attach the report
 * (one link per upload and project), settle each source upload and tell its uploader. */
async function acceptRoutedLines(ctx: TenantContext, projectId: string, rowIds: string[], isoWeek: string, week: string, now: Date): Promise<{ attached: boolean }> {
  const rows = await withTenant(ctx, (tx) =>
    tx.statusUploadRow.findMany({
      where: { id: { in: rowIds }, projectId, state: "routed" },
      select: { id: true, uploadId: true, upload: { select: { uploadedById: true, format: true, uploadedBy: { select: { name: true } } } }, project: { select: { code: true } } },
    }),
  );
  if (!rows.length) return { attached: false };
  let attached = false;
  await withTenant(ctx, async (tx) => {
    const checkIn = await tx.checkIn.findFirst({ where: { projectId, isoWeek }, select: { id: true } });
    await tx.statusUploadRow.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { state: "accepted", appliedCheckInId: checkIn?.id ?? null, appliedAt: now } });
    const me = await tx.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
    for (const uploadId of new Set(rows.map((r) => r.uploadId))) {
      const r = rows.find((x) => x.uploadId === uploadId)!;
      await audit(tx, ctx, { action: "update", entityType: "status_upload_row", entityId: r.id, after: { state: "accepted", projectId } });
      if (r.upload.uploadedById && r.upload.uploadedById !== ctx.userId) {
        await emitDomainEvent(tx, ctx, {
          type: "status_upload.accepted",
          entityType: "status_upload",
          entityId: uploadId,
          notify: [{ userId: r.upload.uploadedById, kind: "status_upload.accepted", message: `${me?.name ?? "The PM"} used your status report line for ${r.project?.code ?? "their project"}.`, link: `/reports/update?week=${isoWeek}` }],
        });
      }
    }
  });
  for (const uploadId of new Set(rows.map((r) => r.uploadId))) {
    const r = rows.find((x) => x.uploadId === uploadId)!;
    const has = await withTenant(ctx, (tx) => tx.projectDocument.count({ where: { projectId, statusUploadId: uploadId } }));
    if (!has) {
      await createDocument(ctx, projectId, { title: `Status report · Week ${week} · from ${r.upload.uploadedBy?.name ?? "a colleague"}`, kind: "Other", format: r.upload.format as ReportFormat, source: "Uploaded" }, { statusUploadId: uploadId });
      attached = true;
    }
    await settleUpload(ctx, uploadId, now);
  }
  return { attached };
}

/** The PM dismissed a line a colleague sent: it stays on the upload as "dismissed", and the
 * uploader is told. Only somebody who may write the project can dismiss its lines. */
export async function dismissRoutedLine(ctx: TenantContext, rowId: string): Promise<void> {
  const row = await withTenant(ctx, (tx) =>
    tx.statusUploadRow.findFirst({ where: { id: rowId, state: "routed" }, select: { id: true, projectId: true, uploadId: true, upload: { select: { uploadedById: true, isoWeek: true } }, project: { select: { code: true } } } }),
  );
  if (!row || !row.projectId || !(await canWriteProject(ctx, row.projectId))) throw new UploadNotFoundError();
  await withTenant(ctx, async (tx) => {
    await tx.statusUploadRow.update({ where: { id: row.id }, data: { state: "dismissed" } });
    await audit(tx, ctx, { action: "update", entityType: "status_upload_row", entityId: row.id, after: { state: "dismissed" } });
    const me = await tx.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
    if (row.upload.uploadedById && row.upload.uploadedById !== ctx.userId) {
      await emitDomainEvent(tx, ctx, {
        type: "status_upload.dismissed",
        entityType: "status_upload",
        entityId: row.uploadId,
        notify: [{ userId: row.upload.uploadedById, kind: "status_upload.dismissed", message: `${me?.name ?? "The PM"} didn't use your status report line for ${row.project?.code ?? "their project"}.`, link: `/reports/update?week=${row.upload.isoWeek}` }],
      });
    }
  });
}

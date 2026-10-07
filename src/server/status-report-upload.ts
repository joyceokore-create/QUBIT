import "server-only";
import { z } from "zod";
import { canWriteProject } from "@/lib/access";
import { can } from "@/lib/rbac";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";

import { confirmCheckIn, getCurrentCheckIn, RAGS, saveCheckInDraft } from "@/server/checkins";
import { CheckpointError, getProjectCheckpoints, setCheckpointState } from "@/server/checkpoints";
import { createDocument } from "@/server/documents";
import { updateProject } from "@/server/projects";
import { extractStatusReport, NARRATIVE_MAX, STAGE_MAX, type ParsedRow, type ReportFormat } from "@/server/status-report/parse";
import { matchProject, matchStageGate, type MatchableProject, type RowMatch } from "@/server/status-report/match";

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
 * progress, the gates before it done).
 */

export interface PreviewRow extends ParsedRow {
  match: RowMatch;
  /** This week's state of the matched project, so the table can say "already sent". */
  alreadySent: boolean;
}

export interface UploadPreview {
  format: ReportFormat;
  preparedBy: string | null;
  reportDate: string | null;
  isoWeek: string;
  rows: PreviewRow[];
  projects: MatchableProject[];
  warnings: string[];
}

export const ApplyInput = z.object({
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
      }),
    )
    .min(1)
    .max(60),
  file: z
    .object({
      name: z.string().trim().min(1).max(200),
      format: z.enum(["docx", "xlsx", "pdf"]),
      base64: z.string().min(1).max(7_200_000), // 5 MB file → ~6.8 MB of base64
    })
    .optional(),
});
export type ApplyInputT = z.infer<typeof ApplyInput>;

export interface ApplyRow {
  projectId: string;
  code: string;
  outcome: "drafted" | "resent" | "skipped" | "error";
  message?: string;
  attached: boolean;
  /** What the Stage cell did to the delivery gates, when it named one. */
  gates?: string | null;
}

/** The Stage cell names a gate → that gate is in progress and every gate before it done
 * (states already Done/Blocked are left alone; a gate whose checklist is unmet is closed
 * with the upload as the written reason). Returns a one-line summary, or null. */
async function applyStageToGates(ctx: TenantContext, projectId: string, stage: string, reason: string): Promise<string | null> {
  const cps = await getProjectCheckpoints(ctx, projectId);
  const gate = matchStageGate(stage, cps.rows);
  if (!gate) return null;
  let closed = 0;
  for (const row of cps.rows) {
    if (row.orderIndex < gate.orderIndex && (row.state === "NotStarted" || row.state === "InProgress")) {
      try {
        await setCheckpointState(ctx, projectId, { checkpointId: row.checkpointId, state: "Done" });
      } catch (e) {
        if (!(e instanceof CheckpointError)) throw e;
        await setCheckpointState(ctx, projectId, { checkpointId: row.checkpointId, state: "Done", overrideReason: reason });
      }
      closed++;
    }
  }
  let moved = false;
  if (gate.state === "NotStarted") {
    await setCheckpointState(ctx, projectId, { checkpointId: gate.checkpointId, state: "InProgress" });
    moved = true;
  }
  if (!moved && closed === 0) return `${gate.name} already recorded`;
  return `${gate.name} in progress${closed > 0 ? ` · ${closed} earlier ${closed === 1 ? "gate" : "gates"} done` : ""}`;
}

/** The projects the viewer may fill from a report: the PM rule (lead or PM member), or
 * every active project for Heads / admins holding project:update. */
async function matchableProjects(ctx: TenantContext): Promise<MatchableProject[]> {
  const broad = can(ctx, "project:update") && !ctx.roles.includes("ProjectManager");
  return withTenant(ctx, (tx) =>
    tx.project.findMany({
      where: {
        status: { notIn: ["Completed", "Cancelled"] },
        ...(broad ? {} : { OR: [{ leadUserId: ctx.userId }, { members: { some: { userId: ctx.userId, role: "Project Manager" } } }] }),
      },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  );
}

export async function previewStatusReport(ctx: TenantContext, buf: Buffer, fileName: string, now = new Date()): Promise<UploadPreview> {
  const [report, projects] = await Promise.all([extractStatusReport(buf, fileName), matchableProjects(ctx)]);
  const isoWeek = isoWeekId(now);
  const sentIds = new Set(
    (
      await withTenant(ctx, (tx) =>
        tx.checkIn.findMany({ where: { isoWeek, status: "Confirmed", projectId: { in: projects.map((p) => p.id) } }, select: { projectId: true } }),
      )
    ).map((c) => c.projectId),
  );
  const rows: PreviewRow[] = report.rows.map((r) => {
    const match = matchProject(r.project, projects);
    const alreadySent = Boolean(match.projectId && sentIds.has(match.projectId));
    return { ...r, match, alreadySent, warnings: alreadySent ? [...r.warnings, "This week's update was already sent — tick Replace to resend it with this row."] : r.warnings };
  });
  return { format: report.format, preparedBy: report.preparedBy, reportDate: report.reportDate, isoWeek, rows, projects, warnings: report.warnings };
}

export async function applyStatusReport(ctx: TenantContext, input: ApplyInputT, now = new Date()): Promise<ApplyRow[]> {
  const isoWeek = isoWeekId(now);
  const week = isoWeek.split("-W")[1];
  const dateLabel = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const reason = `From the status report uploaded ${dateLabel}${input.preparedBy ? ` (prepared by ${input.preparedBy})` : ""}`.slice(0, 300);
  const codes = new Map(
    (await withTenant(ctx, (tx) => tx.project.findMany({ where: { id: { in: input.rows.map((r) => r.projectId) } }, select: { id: true, code: true } }))).map((p) => [p.id, p.code]),
  );
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
      const current = await getCurrentCheckIn(ctx, row.projectId, now);
      let outcome: ApplyRow["outcome"] = "drafted";
      if (current.status === "Confirmed") {
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
      if (row.stage) {
        await updateProject(ctx, row.projectId, { statusNote: row.stage });
        gates = await applyStageToGates(ctx, row.projectId, row.stage, reason).catch(() => null);
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
      out.push({ projectId: row.projectId, code, outcome, attached, gates });
    } catch (e) {
      out.push({ projectId: row.projectId, code, outcome: "error", message: e instanceof Error ? e.message : "Could not apply.", attached: false });
    }
  }
  return out;
}

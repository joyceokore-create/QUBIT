import "server-only";
import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { aiCapReached } from "@/server/q/ai-limits";
import { createLumiRun, deleteLumiConversation, LumiError, lumiConnection, uploadLumiFile, type LumiConnection } from "@/server/connectors/lumi";
import { NARRATIVE_MAX, NO_SLIDE, normaliseStatus, STAGE_MAX, type ParsedReport, type ParsedRow, type ReportFormat } from "@/server/status-report/parse";

/**
 * Plan Phase 3 — read a status document the rules can't (free-form prose, a scanned PDF)
 * with Lumi AI's general tasks: upload the file, run one task, read the answer, delete the
 * conversation (its transcript, files and personal-data lookup go with it).
 *
 * Lumi's live API refuses an inline output.schema today and loops on json-without-schema,
 * so the default asks for a text answer holding ONLY JSON and QUBIT validates it here.
 * LUMI_INLINE_SCHEMA=1 switches to output { format: "json", schema } once Lumi accepts it.
 * Either way QUBIT's own zod check decides: a line that doesn't fit is dropped with a reason.
 * Lumi's lines go to the same review as the rules' — AI never writes to a project.
 */

export const EXTRACT_PURPOSE = "upload:extract";
const MAX_LINES = 200;
/** The PM waits on the preview, so a reading is cut off well inside the proxy's patience. */
const READ_DEADLINE_MS = 4 * 60_000;

const MEDIA_TYPE: Record<ReportFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
};

/** What Lumi is asked to return for each project the document reports on. */
export const EXTRACT_SCHEMA = {
  type: "object",
  required: ["projects"],
  properties: {
    projects: {
      type: "array",
      items: {
        type: "object",
        required: ["project"],
        properties: {
          project: { type: "string" },
          code: { type: ["string", "null"] },
          market: { type: ["string", "null"] },
          rag: { type: ["string", "null"], enum: ["Green", "Amber", "Red", null] },
          stage: { type: "string" },
          update: { type: "string" },
          percent: { type: ["number", "null"] },
          risks: { type: "array", items: { type: "string" } },
          next_steps: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export const EXTRACT_MESSAGE =
  "Read the attached weekly project status document. If it is a scan or an image without a text layer, " +
  "use your OCR tool to read it first; do not ask, just run it. For every project it reports on, give: " +
  "project (the name as written), code (the project code, or null), market (a country or market the line is about, or null), " +
  "rag (Green, Amber or Red, only if the document states it, else null), stage (the delivery stage as written, or empty), " +
  `update (what the document says about the project this week, under ${NARRATIVE_MAX} characters), percent (percent complete if stated, else null), ` +
  "risks (each risk or issue stated, one per item) and next_steps (each next step stated, one per item). " +
  "Use only what the document states; never guess a status, stage or code. " +
  'Answer with ONLY a JSON object of the form {"projects":[{"project":"","code":null,"market":null,"rag":null,"stage":"","update":"","percent":null,"risks":[],"next_steps":[]}]} ' +
  "and nothing else. Do not create or edit files.";

const text = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max));
const list = z
  .array(z.union([z.string(), z.null()]))
  .optional()
  .transform((v) => (v ?? []).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.replace(/\s+/g, " ").trim().slice(0, 300)).slice(0, 20));

const LumiLine = z.object({
  project: z.string().transform((v) => v.replace(/\s+/g, " ").trim()),
  code: text(40),
  market: text(80),
  rag: z.union([z.string(), z.null()]).optional(),
  stage: z.union([z.string(), z.null()]).optional(),
  update: z.union([z.string(), z.null()]).optional(),
  percent: z.union([z.number(), z.string(), z.null()]).optional(),
  risks: list,
  next_steps: list,
});

/** Lumi's answer text → the JSON value in it (tolerates a ``` fence or a sentence around it). */
export function jsonFromAnswer(raw: string): unknown {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    // No JSON: Lumi answered in words (e.g. "the vision model is not registered") — pass them on.
    if (start < 0 || end <= start) throw new LumiExtractError(s ? `Lumi answered instead of reading: “${s.replace(/\s+/g, " ").slice(0, 200)}”` : "Lumi's answer was empty.");
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {
      throw new LumiExtractError("Lumi's answer was not valid JSON.");
    }
  }
}

/** Validate Lumi's lines into the rows the review shows. Bad lines are dropped with a reason. */
export function rowsFromLumi(value: unknown): { rows: ParsedRow[]; warnings: string[] } {
  const projects = (value as { projects?: unknown } | null)?.projects;
  if (!Array.isArray(projects)) throw new LumiExtractError("Lumi's answer had no list of projects.");
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  projects.slice(0, MAX_LINES).forEach((item, i) => {
    const parsed = LumiLine.safeParse(item);
    if (!parsed.success || !parsed.data.project) {
      warnings.push(`Lumi's line ${i + 1} was left out: it named no project.`);
      return;
    }
    const l = parsed.data;
    const w: string[] = [];
    const statusRaw = typeof l.rag === "string" ? l.rag.trim() : "";
    const status = normaliseStatus(statusRaw);
    if (statusRaw && !status) w.push(`Status "${statusRaw.slice(0, 40)}" isn't Green, Amber or Red — pick one.`);
    let stage = (l.stage ?? "").replace(/\s+/g, " ").trim();
    if (stage.length > STAGE_MAX) {
      stage = stage.slice(0, STAGE_MAX);
      w.push(`Stage cut to ${STAGE_MAX} characters.`);
    }
    let update = (l.update ?? "").replace(/\s+/g, " ").trim();
    if (update.length > NARRATIVE_MAX) {
      update = update.slice(0, NARRATIVE_MAX);
      w.push(`Update cut to ${NARRATIVE_MAX} characters.`);
    }
    const pct = typeof l.percent === "string" ? Number(l.percent.replace("%", "")) : l.percent;
    const percent = typeof pct === "number" && Number.isFinite(pct) && pct >= 0 && pct <= 100 ? Math.round(pct) : null;
    const sections = [
      ...(l.risks.length ? [{ title: "Risks & issues", lines: l.risks }] : []),
      ...(l.next_steps.length ? [{ title: "Next steps", lines: l.next_steps }] : []),
    ];
    rows.push({ line: rows.length + 1, project: l.project.slice(0, 200), code: l.code || null, market: l.market || null, percent, status, statusRaw, stage, update, warnings: w, ...NO_SLIDE, sections });
  });
  if (projects.length > MAX_LINES) warnings.push(`Only the first ${MAX_LINES} of Lumi's lines were kept.`);
  return { rows, warnings };
}

export class LumiExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LumiExtractError";
  }
}

export interface LumiExtraction extends ParsedReport {
  runId: string;
}

/** Is Lumi set up for this tenant (Configs › Integrations, or the environment)? */
export async function lumiReaderAvailable(ctx: Pick<TenantContext, "tenantId" | "userId">): Promise<boolean> {
  return (await lumiConnection(ctx).catch(() => null)) !== null;
}

async function logCall(ctx: TenantContext, entry: { usedAi: boolean; model: string; inputTokens?: number; outputTokens?: number; latencyMs: number }) {
  try {
    await withTenant(ctx, (tx) =>
      tx.aiCallLog.create({
        data: { tenantId: ctx.tenantId, userId: ctx.userId, purpose: EXTRACT_PURPOSE, model: entry.model, usedAi: entry.usedAi, inputTokens: entry.inputTokens ?? 0, outputTokens: entry.outputTokens ?? 0, latencyMs: entry.latencyMs },
      }),
    );
  } catch {
    // Logging must never break the upload.
  }
}

/** A plain reason for the PM, from Lumi's error codes. */
function reasonOf(e: unknown): string {
  if (e instanceof LumiExtractError) return e.message;
  if (e instanceof LumiError) {
    if (e.code === "quota_exceeded") return "Lumi's token allowance for QUBIT is used up for now.";
    if (e.code === "rate_limited") return "Lumi is busy; try again in a minute.";
    if (e.code === "model_unavailable") return "Lumi has no model switched on for QUBIT.";
    if (e.code === "payload_too_large") return "The file is too large for Lumi.";
    if (e.code === "run_timeout") return e.message;
    if (e.status === 401 || e.status === 403) return "Lumi refused QUBIT's credential — check Configs › Integrations.";
    return `Lumi couldn't read it (${e.code}).`;
  }
  return "Lumi couldn't be reached.";
}

/**
 * Read the file with Lumi. Throws LumiExtractError with a plain reason the preview shows
 * (the rules' result then stands). Logs metrics only — never the file or the answer.
 */
export async function extractWithLumi(ctx: TenantContext, input: { buf: Buffer; fileName: string; format: ReportFormat }, conn?: LumiConnection | null): Promise<LumiExtraction> {
  const connection = conn === undefined ? await lumiConnection(ctx).catch(() => null) : conn;
  if (!connection) throw new LumiExtractError("Lumi isn't connected for this workspace.");
  if (await aiCapReached(ctx, EXTRACT_PURPOSE)) throw new LumiExtractError("Today's AI reading allowance is used up; QUBIT read the file with its rules.");
  const started = Date.now();
  let conversationId: string | null = null;
  try {
    const file = await uploadLumiFile(connection, input.buf, input.fileName, MEDIA_TYPE[input.format]);
    if (file.status === "rejected") throw new LumiExtractError("Lumi refused the file (it failed Lumi's checks).");
    const inline = process.env.LUMI_INLINE_SCHEMA === "1";
    const run = await createLumiRun(connection, {
      message: EXTRACT_MESSAGE,
      file_ids: [file.file_id],
      output: inline ? { format: "json", schema: EXTRACT_SCHEMA } : { format: "text" },
      metadata: { purpose: EXTRACT_PURPOSE },
    }, { deadlineMs: READ_DEADLINE_MS });
    conversationId = run.conversation_id;
    await logCall(ctx, { usedAi: run.status === "done", model: run.model ?? "lumi", inputTokens: run.usage?.input_tokens, outputTokens: run.usage?.output_tokens, latencyMs: Date.now() - started });
    if (run.status !== "done") {
      if (run.error?.error) throw new LumiError(run.error.message ?? run.error.error, 422, run.error.error);
      const asked = run.pending?.text?.replace(/\s+/g, " ").trim().slice(0, 200);
      throw new LumiExtractError(run.status.startsWith("needs_") ? `Lumi stopped instead of answering${asked ? `: “${asked}”` : "."}` : "Lumi did not finish reading the file.");
    }
    const value = inline && run.output.data != null ? run.output.data : jsonFromAnswer(run.output.text ?? "");
    const { rows, warnings } = rowsFromLumi(value);
    return { preparedBy: null, reportDate: null, rows, warnings, runId: run.run_id };
  } catch (e) {
    throw new LumiExtractError(reasonOf(e));
  } finally {
    if (conversationId) await deleteLumiConversation(connection, conversationId).catch(() => undefined);
  }
}

import "server-only";
import { isoWeekId, isoWeekMonday, isValidIsoWeek, shiftIsoWeek, weekWindow } from "@/lib/iso-week";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { checkAiSummary, composeSummary, type SummaryInput } from "@/lib/rollup-summary";
import { leaveExposureNextWeek } from "@/server/absence";
import { assertHead, getRollupForWeek, RollupError } from "@/server/portfolio-reports";
import { aiCapReached } from "@/server/q/ai-limits";
import { llmChat, llmEnabled, llmModel } from "@/server/q/llm";
import { findDecisionBlockers } from "@/server/reports-week";

/**
 * Plan Phase 4 — draft the Head's managerial summary for a week's roll-up. It only ever
 * PRE-FILLS the roll-up line: the Head edits it and approves through approveRollup, so the
 * approval, the PDF digest and the email are unchanged.
 *
 * Engines, in order: the AI model (today the in-house box via llmChat; plan Phase 3 puts
 * Lumi ahead of it), then the rule-based composer. The AI sees only the week's data as
 * JSON and must name no project that isn't in it; anything that fails the checks, the
 * daily cap, or the call itself falls back to the rules. AiCallLog records metrics only.
 */

export const SUMMARY_PURPOSE = "summary:rollup";

export interface RollupSummary {
  text: string;
  engine: "ai" | "rules";
  /** Why the rules wrote it: no AI configured, today's cap used, the call failed, or the
   * AI's text failed the grounding checks. */
  reason?: "off" | "cap" | "failed" | "rejected";
}

/** The week's facts for the summary: the roll-up rows (as the rail shows them), last week's
 * RAG per project, decisions waiting, and next week's milestones and leave. */
export async function gatherSummaryInput(ctx: TenantContext, isoWeek: string, now = new Date()): Promise<SummaryInput> {
  const isCurrent = isoWeek === isoWeekId(now);
  const at = isCurrent ? now : weekWindow(isoWeekMonday(isoWeek)).end;
  const [current, previous] = await Promise.all([getRollupForWeek(ctx, isoWeek, now), getRollupForWeek(ctx, shiftIsoWeek(isoWeek, -1), now)]);
  const prevRag = new Map(previous.rows.map((r) => [r.projectId, r.rag]));
  const extra = await withTenant(ctx, async (tx) => {
    const [decisions, milestones, leave] = await Promise.all([
      findDecisionBlockers(tx, at),
      tx.projectMilestone.findMany({
        where: { status: { not: "Done" }, dueDate: { gte: at, lt: new Date(at.getTime() + 7 * 86_400_000) }, project: { status: { notIn: ["Completed", "Cancelled"] } } },
        select: { name: true, project: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      leaveExposureNextWeek(tx, at),
    ]);
    return { decisions, milestones, leave };
  });
  return {
    isoWeek,
    projects: current.rows.map((r) => ({ code: r.code, name: r.name, pmName: r.pmName, rag: r.rag, prevRag: prevRag.get(r.projectId) ?? null, checkIn: r.checkIn, narrative: r.narrative })),
    decisions: extra.decisions.map((d) => ({ code: d.projectCode, description: d.description, ageDays: d.ageDays, severity: d.severity })),
    milestones: extra.milestones.map((m) => ({ project: m.project.name, name: m.name })),
    leave: extra.leave,
  };
}

const SYSTEM = (tenantName: string) =>
  `You write the weekly managerial summary for ${tenantName}'s project portfolio, for its executives. ` +
  `Use ONLY the JSON data in the user message. Never invent projects, codes, people, numbers or dates. ` +
  `Write plain text with no Markdown, at most 900 characters, as up to five lines, each starting with one of these labels: ` +
  `"Week NN:" (the headline: the green/amber/red spread and what changed since last week), ` +
  `"Needs attention:" (red projects and those that got worse, by code and name, with the reason from their PM's line), ` +
  `"Decisions needed:", "Next week:" (milestones due and leave), "No update yet:". Leave out a line that has nothing to say. ` +
  `Lead with what needs the executive's attention. No preamble.`;

async function logCall(ctx: TenantContext, entry: { usedAi: boolean; inputTokens?: number; outputTokens?: number; latencyMs?: number }) {
  try {
    await withTenant(ctx, (tx) =>
      tx.aiCallLog.create({
        data: { tenantId: ctx.tenantId, userId: ctx.userId, purpose: SUMMARY_PURPOSE, model: llmModel(), usedAi: entry.usedAi, inputTokens: entry.inputTokens ?? 0, outputTokens: entry.outputTokens ?? 0, latencyMs: entry.latencyMs ?? 0 },
      }),
    );
  } catch {
    // Logging must never break the summary.
  }
}

/** Head-only. `week` defaults to this week; a future week is refused. */
export async function generateRollupSummary(ctx: TenantContext, opts: { week?: string | null; tenantName: string }, now = new Date()): Promise<RollupSummary> {
  assertHead(ctx);
  const isoWeek = opts.week ?? isoWeekId(now);
  if (!isValidIsoWeek(isoWeek) || isoWeekMonday(isoWeek) > now) throw new RollupError("Pick a week that has started.", "BAD_WEEK");
  const input = await gatherSummaryInput(ctx, isoWeek, now);
  const rules = composeSummary(input);

  if (!llmEnabled()) {
    await logCall(ctx, { usedAi: false });
    return { text: rules, engine: "rules", reason: "off" };
  }
  if (await aiCapReached(ctx, SUMMARY_PURPOSE, now)) {
    await logCall(ctx, { usedAi: false });
    return { text: rules, engine: "rules", reason: "cap" };
  }

  // The model sees the facts it needs, not who the PMs are.
  const data = { ...input, projects: input.projects.map(({ pmName: _pm, ...p }) => p) };
  const start = Date.now();
  try {
    const res = await llmChat({
      system: SYSTEM(opts.tenantName || "the organisation"),
      maxTokens: 600,
      temperature: 0.2,
      messages: [{ role: "user", content: "Write this week's managerial summary from this data (JSON):\n\n```json\n" + JSON.stringify(data) + "\n```" }],
    });
    await logCall(ctx, { usedAi: true, inputTokens: res.inputTokens, outputTokens: res.outputTokens, latencyMs: Date.now() - start });
    const checked = checkAiSummary(res.text, input.projects.map((p) => p.code));
    return checked ? { text: checked, engine: "ai" } : { text: rules, engine: "rules", reason: "rejected" };
  } catch {
    await logCall(ctx, { usedAi: false, latencyMs: Date.now() - start });
    return { text: rules, engine: "rules", reason: "failed" };
  }
}

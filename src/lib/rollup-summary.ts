/**
 * Plan Phase 4 — the managerial summary that pre-fills the Head's weekly roll-up line.
 * Pure and client-safe: the rule-based composer (used when no AI engine is available, or
 * when the AI's text fails the checks), and the checks themselves. The output is plain
 * text, at most four or five labelled lines, within the roll-up line's 1,000 characters —
 * it renders unchanged on the executive card, the PDF digest and the email.
 */

import type { Rag } from "@/server/health";

/** The roll-up line's limit (lib/workspace-schema rollupNarrative). */
export const SUMMARY_MAX = 1000;

export interface SummaryProject {
  code: string;
  name: string;
  pmName: string | null;
  rag: Rag;
  /** Last week's RAG for this project (null = it wasn't in last week's roll-up). */
  prevRag: Rag | null;
  checkIn: "Confirmed" | "Draft" | "None";
  /** The PM's confirmed line for the week, if any. */
  narrative: string | null;
}

export interface SummaryInput {
  isoWeek: string;
  projects: SummaryProject[];
  /** Blockers waiting on a decision (critical, or past the Head's escalation age). */
  decisions: { code: string; description: string; ageDays: number; severity: string }[];
  /** Milestones due in the next seven days. */
  milestones: { project: string; name: string }[];
  /** Next week's leave: people away and the projects most affected. */
  leave: { peopleAway: number; projects: { projectName: string; away: number; members: number }[] };
}

const RANK: Record<Rag, number> = { Green: 0, Amber: 1, Red: 2 };
const word = (r: Rag) => r.toLowerCase();

/** First sentence of a PM line, shortened for a summary clause. */
function gist(text: string | null, max = 90): string {
  if (!text) return "";
  const first = text.replace(/\s+/g, " ").trim().split(/(?<=[.;!?])\s/)[0] ?? "";
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first.replace(/[.;]$/, "");
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How many steps a project got worse since last week (0 when it didn't, or is new). */
const slip = (p: SummaryProject) => (p.prevRag ? Math.max(0, RANK[p.rag] - RANK[p.prevRag]) : 0);

/** Projects needing attention: red first, then those that got worse, worst first. */
export function attentionList(projects: SummaryProject[]): SummaryProject[] {
  return projects
    .filter((p) => p.rag === "Red" || (p.prevRag !== null && RANK[p.rag] > RANK[p.prevRag]))
    .sort((a, b) => RANK[b.rag] - RANK[a.rag] || slip(b) - slip(a) || a.name.localeCompare(b.name));
}

/** The rule-based summary: always available, always grounded, always within SUMMARY_MAX. */
export function composeSummary(input: SummaryInput, limits = { attention: 4, decisions: 3, milestones: 3, missing: 4 }): string {
  const ps = input.projects;
  const n = input.isoWeek.split("-W")[1];
  const g = ps.filter((p) => p.rag === "Green").length;
  const a = ps.filter((p) => p.rag === "Amber").length;
  const r = ps.filter((p) => p.rag === "Red").length;
  const worse = ps.filter((p) => p.prevRag && RANK[p.rag] > RANK[p.prevRag]).length;
  const better = ps.filter((p) => p.prevRag && RANK[p.rag] < RANK[p.prevRag]).length;
  const reported = ps.filter((p) => p.checkIn === "Confirmed").length;

  const lines: string[] = [];
  const moved = worse || better ? ` ${[worse ? `${worse} worse` : "", better ? `${better} better` : ""].filter(Boolean).join(", ")} than last week.` : " No change in status from last week.";
  lines.push(`Week ${n}: ${g} green, ${a} amber, ${r} red across ${plural(ps.length, "project")}.${moved} ${reported} of ${ps.length} PMs reported.`);

  const attn = attentionList(ps);
  if (attn.length) {
    const items = attn.slice(0, limits.attention).map((p) => {
      const was = p.prevRag && p.prevRag !== p.rag ? `, was ${word(p.prevRag)}` : "";
      const why = gist(p.narrative);
      return `${p.code} ${p.name} (${word(p.rag)}${was})${why ? `: ${why}` : ""}`;
    });
    lines.push(`Needs attention: ${items.join("; ")}${attn.length > limits.attention ? `; +${attn.length - limits.attention} more` : ""}.`);
  }

  if (input.decisions.length) {
    const items = input.decisions.slice(0, limits.decisions).map((d) => `${d.code}: ${gist(d.description, 70)} (${plural(d.ageDays, "day")})`);
    lines.push(`Decisions needed: ${items.join("; ")}${input.decisions.length > limits.decisions ? `; +${input.decisions.length - limits.decisions} more` : ""}.`);
  }

  const next: string[] = [];
  if (input.milestones.length) {
    const names = input.milestones.slice(0, limits.milestones).map((m) => `${m.project} ${m.name}`);
    next.push(`${plural(input.milestones.length, "milestone")} due (${names.join(", ")}${input.milestones.length > limits.milestones ? ", …" : ""})`);
  }
  if (input.leave.peopleAway) {
    const top = input.leave.projects[0];
    next.push(`${plural(input.leave.peopleAway, "person", "people")} on leave${top ? `, ${top.projectName} most affected` : ""}`);
  }
  if (next.length) lines.push(`Next week: ${next.join("; ")}.`);

  const missing = ps.filter((p) => p.checkIn !== "Confirmed");
  if (missing.length && missing.length < ps.length) {
    const names = missing.slice(0, limits.missing).map((p) => p.name);
    lines.push(`No update yet: ${names.join(", ")}${missing.length > limits.missing ? `, +${missing.length - limits.missing} more` : ""}.`);
  }

  const text = lines.join("\n");
  if (text.length <= SUMMARY_MAX) return text;
  // Too long: shorten the lists before ever cutting a sentence.
  if (limits.attention > 1 || limits.decisions > 1 || limits.milestones > 1 || limits.missing > 1) {
    return composeSummary(input, {
      attention: Math.max(1, limits.attention - 1),
      decisions: Math.max(1, limits.decisions - 1),
      milestones: Math.max(1, limits.milestones - 1),
      missing: Math.max(1, limits.missing - 1),
    });
  }
  return `${text.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

/** Codes that look like project codes ("RBS-03", "SRU-A"), for the grounding check. */
const CODE_RE = /\b[A-Z]{2,6}-[A-Z0-9]{1,6}\b/g;

/**
 * Accept the AI's text only if it is plain, fits the line, and names no project code that
 * isn't in the data. Returns the cleaned text, or null to fall back to composeSummary.
 */
export function checkAiSummary(raw: string, knownCodes: string[]): string | null {
  const text = raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (text.length < 20 || text.length > SUMMARY_MAX) return null;
  const known = new Set(knownCodes.map((c) => c.toUpperCase()));
  for (const m of text.matchAll(CODE_RE)) if (!known.has(m[0])) return null;
  return text;
}

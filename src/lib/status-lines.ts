// Milestone A — the colour of a drafted status-update bullet. The lines come from the
// fixed templates in src/server/checkins.ts (buildDraftLines), so the matches are
// deterministic; anything unrecognised (member lines, future wording) stays neutral —
// a safe failure, never a wrong colour.

export type LineTone = "bad" | "warn" | "ok" | "neutral";

export const TONE_TOKEN: Record<LineTone, string> = { bad: "--bad", warn: "--warn", ok: "--ok", neutral: "--ink5" };

export function lineTone(line: string): LineTone {
  if (/blockers? opened|overdue/i.test(line)) return "bad";
  if (/slipped|progress -/i.test(line)) return "warn";
  if (/completed|resolved|milestone done|progress \+/i.test(line)) return "ok";
  return "neutral";
}

/**
 * Commit grammar (docs/15 §6.3) — the pure half of commit automation, shared by the
 * webhook and any future polling fallback, and unit-tested table-style.
 *
 *   P001-12 #progress          → InProgress
 *   P001-12 #done              → InReview  (NEVER Completed — QA owns Completed)
 *   fixes P001-12 / closes …   → InReview
 *   P001-12 #blocked <reason>  → open a linked Blocker
 *   bare P001-12               → link only (mention)
 *
 * Multiple keys per message are allowed; unknown keys are the caller's to ignore;
 * matching is case-insensitive and keys are returned uppercased, because QUBIT task keys
 * are stored uppercase ("<project.code>-<n>").
 */

export type CommitAction = "progress" | "done" | "blocked" | "mention";

export interface CommitDirective {
  /** Uppercased task key, e.g. "P001-12". */
  key: string;
  action: CommitAction;
  /** #blocked only: the free text after the tag, capped — it becomes the Blocker text. */
  reason?: string;
}

/** Task-key shape: <code>-<number>, code 2–10 alphanumerics starting with a letter. */
const KEY = /\b([A-Za-z][A-Za-z0-9]{1,9}-\d{1,6})\b/g;

const MAX_REASON = 300;

/**
 * Parse one commit message into directives. Precedence per key (strongest wins when a
 * message says several things about the same key): blocked > done > progress > mention —
 * a commit that says "P1-2 #done #blocked broke staging" is a blocked task, not a done one.
 */
export function parseCommitMessage(message: string): CommitDirective[] {
  const text = message ?? "";
  const byKey = new Map<string, CommitDirective>();
  const RANK: Record<CommitAction, number> = { mention: 0, progress: 1, done: 2, blocked: 3 };

  const record = (rawKey: string, action: CommitAction, reason?: string) => {
    const key = rawKey.toUpperCase();
    const prior = byKey.get(key);
    if (!prior || RANK[action] > RANK[prior.action]) {
      byKey.set(key, { key, action, ...(reason ? { reason } : {}) });
    }
  };

  // fixes/closes/resolves KEY → done. GitHub's own closing keywords, reused so people
  // don't learn two grammars.
  for (const m of text.matchAll(/\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s*:?\s+([A-Za-z][A-Za-z0-9]{1,9}-\d{1,6})\b/gi)) {
    record(m[1], "done");
  }

  // KEY #progress / KEY #done — the tag alone; no tail capture, so several directives
  // can share a line ("P1-3 #done P1-4 #progress").
  for (const m of text.matchAll(/\b([A-Za-z][A-Za-z0-9]{1,9}-\d{1,6})\s+#(progress|done)\b/gi)) {
    record(m[1], m[2].toLowerCase() as CommitAction);
  }

  // KEY #blocked [reason…] — the reason IS the rest of the line, by contract: it becomes
  // the Blocker's text, and people write sentences there.
  for (const m of text.matchAll(/\b([A-Za-z][A-Za-z0-9]{1,9}-\d{1,6})\s+#blocked\b[ \t]*([^\n\r]*)/gi)) {
    record(m[1], "blocked", m[2]?.trim().slice(0, MAX_REASON) || undefined);
  }

  // Every remaining key is a mention → link only.
  for (const m of text.matchAll(KEY)) {
    record(m[1], "mention");
  }

  return [...byKey.values()];
}

/** First line of a commit message, capped — what TaskCommitLink stores and cards show. */
export function commitTitle(message: string, max = 500): string {
  return (message ?? "").split("\n")[0].trim().slice(0, max);
}

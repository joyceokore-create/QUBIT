/**
 * Nudge thresholds (docs/15 §6.4 defaults, adopted per DM1.15 №5). One object so
 * Head-of-Projects tuning is a one-file edit. All windows compare against "now" when
 * the nudger job runs (weekday mornings).
 */
export const NUDGE_THRESHOLDS = {
  /** Task due within this window (or overdue) → nudge the assignee. */
  taskDueSoonHours: 48,
  /** Overdue longer than this → escalate to the PM (level 1). */
  taskOverdueEscalateDays: 2,
  /** InProgress/InReview untouched this many BUSINESS days → nudge the assignee. */
  taskStaleBusinessDays: 5,
  /** Stale for twice the threshold → escalate to the PM (level 1). */
  taskStaleEscalateBusinessDays: 10,
  /** Open blocker older than this → nudge the owner (PM when ownerless). */
  blockerOpenDays: 3,
  /** Open blocker older than this → escalate to PM + HeadOfProjects (level 2). */
  blockerHeadDays: 7,
  /** Draft (AI) tasks awaiting approval longer than this → nudge the PM. */
  draftsPendingHours: 48,
  /** High/Critical bug unassigned longer than this → nudge PM + HeadOfQA. */
  bugUnassignedHours: 24,
  /** Milestone due within this window with open linked tasks → nudge the PM. */
  milestoneDueDays: 7,
  /** Default snooze length when the user doesn't choose one. */
  defaultSnoozeDays: 7,
} as const;

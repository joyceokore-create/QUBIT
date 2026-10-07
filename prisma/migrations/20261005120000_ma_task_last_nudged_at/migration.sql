-- Milestone A (workspace redesign) — when a PM last nudged a blocked task's assignee.
-- NULL = never. Rate-limits the Nudge button (one per 24h) and renders "Nudged/Emailed".
-- Column-only; project_task is already under the tenant RLS policy.
ALTER TABLE "project_task" ADD COLUMN "last_nudged_at" TIMESTAMP(3);

-- UX10 (UX plan D8b) — stage history for the Portfolios lifecycle cards ("Avg. N days in stage",
-- "Stuck", and the weekly change lines).

-- 1. When each project entered its current lifecycle stage. Nullable; backfilled below; new
--    rows default to now (the app also sets it whenever the stage changes).
ALTER TABLE "project" ADD COLUMN "stage_entered_at" TIMESTAMP(3);

-- Backfill: the latest audited change of pipeline stage, or of status into/out of Completed or
-- Cancelled (the changes that move the lifecycle stage), else the project's creation time.
-- NOTE for deploy: verify per tenant UNDER RLS afterwards (CLAUDE.md) — if the migration role
-- does not bypass RLS this UPDATE touches no rows; NULL then reads as "unknown" in the app
-- (no average, never "Stuck"), so nothing breaks.
UPDATE "project" p
SET "stage_entered_at" = COALESCE(
  (
    SELECT max(a."created_at")
    FROM "audit_log" a
    WHERE a."tenant_id" = p."tenant_id"
      AND a."entity_type" = 'project'
      AND a."entity_id" = p."id"
      AND a."action" = 'update'
      AND (
        (a."before"->>'pipelineStage') IS DISTINCT FROM (a."after"->>'pipelineStage')
        OR (
          (a."before"->>'status') IS DISTINCT FROM (a."after"->>'status')
          AND ((a."before"->>'status') IN ('Completed', 'Cancelled') OR (a."after"->>'status') IN ('Completed', 'Cancelled'))
        )
      )
  ),
  p."created_at"
)
WHERE p."stage_entered_at" IS NULL;

ALTER TABLE "project" ALTER COLUMN "stage_entered_at" SET DEFAULT CURRENT_TIMESTAMP;

-- 2. The lifecycle stage in each nightly snapshot (NULL for rows written before UX10). The
--    change lines stay hidden until 4 weeks of staged snapshots exist.
ALTER TABLE "project_snapshot" ADD COLUMN "stage" TEXT;

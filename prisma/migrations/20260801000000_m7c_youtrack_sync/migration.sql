-- M7-C (docs/16 §12 M7, BRD FR-INT-05) — mirror external issue-tracker issues onto the
-- LIVE ProjectTask model so progress, boards, weekly reports and requirement coverage all
-- pick them up without a second reporting path.
--
-- No DML, so no DM1.18 tenant loop is needed: every column is additive and nullable, and
-- existing rows are QUBIT-native by definition (source_system IS NULL). Both tables
-- already carry tenant_id with FORCE RLS from their original migrations.

ALTER TABLE "project_task"
  ADD COLUMN "source_system" TEXT,
  ADD COLUMN "external_id" TEXT,
  ADD COLUMN "external_key" TEXT,
  ADD COLUMN "external_url" TEXT,
  ADD COLUMN "external_assignee_name" TEXT,
  ADD COLUMN "external_synced_at" TIMESTAMP(3);

-- The sync upsert key. Postgres treats NULLs as distinct in a unique index, so every
-- QUBIT-native task (all three columns NULL) is exempt — only mirrored rows are constrained.
CREATE UNIQUE INDEX "project_task_project_id_source_system_external_id_key"
  ON "project_task"("project_id", "source_system", "external_id");

ALTER TABLE "project_integration"
  ADD COLUMN "config" JSONB,
  ADD COLUMN "last_sync_at" TIMESTAMP(3),
  ADD COLUMN "last_sync_error" TEXT,
  ADD COLUMN "sync_interval_minutes" INTEGER NOT NULL DEFAULT 60;

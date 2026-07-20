-- Phase 6.1 (docs/15-phase6-delivery-workflow-plan.md, DM1.15) — task taxonomy, task keys,
-- status expansion, blocked-as-flag.
--  * project_task gains type/severity/reporter/parent/source-document/milestone/task_key/
--    last_activity_at; task keys are unique per project (NULLs allowed — Drafts have none).
--  * project_task_counter: per-project key sequence, claimed via UPDATE … RETURNING.
--  * blocker.task_id links a blocker to the task it stalls; "Blocked" stops being a status.
--  * Data migration: status='Blocked' rows → 'InProgress' + a linked Open blocker (DM1.15 №2).

-- AlterTable
ALTER TABLE "blocker" ADD COLUMN     "task_id" TEXT;

-- AlterTable
ALTER TABLE "project_task" ADD COLUMN     "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "milestone_id" TEXT,
ADD COLUMN     "parent_task_id" TEXT,
ADD COLUMN     "reporter_id" TEXT,
ADD COLUMN     "severity" TEXT,
ADD COLUMN     "source_document_id" TEXT,
ADD COLUMN     "task_key" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'Feature';

-- CreateTable
CREATE TABLE "project_task_counter" (
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "project_task_counter_pkey" PRIMARY KEY ("project_id")
);

-- CreateIndex
CREATE INDEX "project_task_counter_tenant_id_idx" ON "project_task_counter"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_task_project_id_task_key_key" ON "project_task"("project_id", "task_key");

-- AddForeignKey
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "project_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "project_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "project_milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task_counter" ADD CONSTRAINT "project_task_counter_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task_counter" ADD CONSTRAINT "project_task_counter_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocker" ADD CONSTRAINT "blocker_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "project_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: new tenant-owned table carries the standard isolation policy (docs/04, DECISIONS D0.1).
-- Mirrored in prisma/rls.sql, which is the canonical list.
ALTER TABLE "project_task_counter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_task_counter" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_project_task_counter ON "project_task_counter";
CREATE POLICY tenant_isolation_project_task_counter ON "project_task_counter"
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Backfill: activity starts from the last recorded update.
UPDATE "project_task" SET "last_activity_at" = "updated_at";

-- Data migration (DM1.15 №2): 'Blocked' stops being a status. Each formerly-Blocked task
-- becomes InProgress with a linked Open blocker so no signal is lost. Runs as superuser
-- during migrate deploy, so it spans tenants by design; tenant_id is copied per row.
INSERT INTO "blocker" ("id", "tenant_id", "project_id", "description", "severity", "status", "owner_id", "task_id", "date_raised", "created_at", "updated_at")
SELECT gen_random_uuid()::text, t."tenant_id", t."project_id", 'Migrated from Blocked status', 'Medium', 'Open', t."assignee_id", t."id", now(), now(), now()
FROM "project_task" t
WHERE t."status" = 'Blocked';

UPDATE "project_task" SET "status" = 'InProgress' WHERE "status" = 'Blocked';

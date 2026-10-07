-- docs/38 (DM1.77) — products, instances and modules, step I1. One migration for every
-- column so later steps need none: the four per-project settings; an instance lead, note
-- and retirement stamp on project_org_status (now cascading with its project); the
-- project_module and module_instance_status tables (RLS'd inline, listed in
-- prisma/rls.sql); module_id on checkpoint_status (a module's own gates); and the optional
-- instance/module tags on tasks, documents, risks, issues, blockers and milestones.
-- Partial unique indexes pin the NULL combinations Postgres would otherwise treat as
-- distinct (same trick as 20260730160000_mda_checkpoints_markets).

-- DropForeignKey
ALTER TABLE "project_org_status" DROP CONSTRAINT "project_org_status_project_id_fkey";

-- DropIndex
DROP INDEX "checkpoint_status_project_id_checkpoint_id_org_unit_id_key";

-- AlterTable
ALTER TABLE "blocker" ADD COLUMN     "module_id" TEXT,
ADD COLUMN     "org_unit_id" TEXT;

-- AlterTable
ALTER TABLE "checkpoint_status" ADD COLUMN     "module_id" TEXT;

-- AlterTable
ALTER TABLE "issue" ADD COLUMN     "module_id" TEXT,
ADD COLUMN     "org_unit_id" TEXT;

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "instance_label" TEXT NOT NULL DEFAULT 'Market',
ADD COLUMN     "instance_tagging" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "module_tracking" TEXT NOT NULL DEFAULT 'state',
ADD COLUMN     "pm_scope" TEXT NOT NULL DEFAULT 'product';

-- AlterTable
ALTER TABLE "project_document" ADD COLUMN     "module_id" TEXT,
ADD COLUMN     "org_unit_id" TEXT;

-- AlterTable
ALTER TABLE "project_milestone" ADD COLUMN     "module_id" TEXT,
ADD COLUMN     "org_unit_id" TEXT;

-- AlterTable
ALTER TABLE "project_org_status" ADD COLUMN     "lead_user_id" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "retired_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "project_task" ADD COLUMN     "module_id" TEXT,
ADD COLUMN     "org_unit_id" TEXT;

-- AlterTable
ALTER TABLE "risk" ADD COLUMN     "module_id" TEXT,
ADD COLUMN     "org_unit_id" TEXT;

-- CreateTable
CREATE TABLE "project_module" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "checkpoint_template_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_instance_status" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "org_unit_id" TEXT,
    "state" TEXT NOT NULL DEFAULT 'Planned',
    "note" TEXT,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_instance_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_module_tenant_id_project_id_idx" ON "project_module"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_module_project_id_code_key" ON "project_module"("project_id", "code");

-- CreateIndex
CREATE INDEX "module_instance_status_tenant_id_project_id_idx" ON "module_instance_status"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "module_instance_status_module_id_org_unit_id_key" ON "module_instance_status"("module_id", "org_unit_id");

-- CreateIndex
CREATE INDEX "blocker_project_id_org_unit_id_idx" ON "blocker"("project_id", "org_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoint_status_project_id_checkpoint_id_org_unit_id_modu_key" ON "checkpoint_status"("project_id", "checkpoint_id", "org_unit_id", "module_id");

-- CreateIndex
CREATE INDEX "issue_project_id_org_unit_id_idx" ON "issue"("project_id", "org_unit_id");

-- CreateIndex
CREATE INDEX "project_document_project_id_org_unit_id_idx" ON "project_document"("project_id", "org_unit_id");

-- CreateIndex
CREATE INDEX "project_milestone_project_id_org_unit_id_idx" ON "project_milestone"("project_id", "org_unit_id");

-- CreateIndex
CREATE INDEX "project_task_project_id_org_unit_id_idx" ON "project_task"("project_id", "org_unit_id");

-- CreateIndex
CREATE INDEX "risk_project_id_org_unit_id_idx" ON "risk"("project_id", "org_unit_id");

-- AddForeignKey
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "project_module"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocker" ADD CONSTRAINT "blocker_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocker" ADD CONSTRAINT "blocker_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "project_module"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "project_module"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "project_module"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_org_status" ADD CONSTRAINT "project_org_status_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_org_status" ADD CONSTRAINT "project_org_status_lead_user_id_fkey" FOREIGN KEY ("lead_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_module" ADD CONSTRAINT "project_module_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_module" ADD CONSTRAINT "project_module_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_instance_status" ADD CONSTRAINT "module_instance_status_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_instance_status" ADD CONSTRAINT "module_instance_status_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_instance_status" ADD CONSTRAINT "module_instance_status_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "project_module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_instance_status" ADD CONSTRAINT "module_instance_status_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_instance_status" ADD CONSTRAINT "module_instance_status_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_status" ADD CONSTRAINT "checkpoint_status_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "project_module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk" ADD CONSTRAINT "risk_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk" ADD CONSTRAINT "risk_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "project_module"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "project_module"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique indexes for the NULL combinations.
CREATE UNIQUE INDEX "checkpoint_status_project_checkpoint_track_key" ON "checkpoint_status"("project_id", "checkpoint_id", "org_unit_id") WHERE "module_id" IS NULL;
CREATE UNIQUE INDEX "checkpoint_status_project_checkpoint_module_key" ON "checkpoint_status"("project_id", "checkpoint_id", "module_id") WHERE "org_unit_id" IS NULL AND "module_id" IS NOT NULL;
CREATE UNIQUE INDEX "module_instance_status_module_product_key" ON "module_instance_status"("module_id") WHERE "org_unit_id" IS NULL;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE project_module ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE project_module FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_project_module ON project_module';
  EXECUTE 'CREATE POLICY tenant_isolation_project_module ON project_module
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
  EXECUTE 'ALTER TABLE module_instance_status ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE module_instance_status FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_module_instance_status ON module_instance_status';
  EXECUTE 'CREATE POLICY tenant_isolation_module_instance_status ON module_instance_status
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

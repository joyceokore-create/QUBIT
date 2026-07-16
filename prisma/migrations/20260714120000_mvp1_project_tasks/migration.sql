-- MVP1 PRD Modules 5–7 — executable project tasks (AI-generated or manual), status, progress.

-- CreateTable
CREATE TABLE "project_task" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "phase" TEXT,
    "owner_role" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "status" TEXT NOT NULL DEFAULT 'NotStarted',
    "estimate" TEXT,
    "assignee_id" TEXT,
    "due_date" TIMESTAMP(3),
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_task_tenant_id_project_id_idx" ON "project_task"("tenant_id", "project_id");

-- AddForeignKey
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security (docs/04-multitenancy.md). Idempotent.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE project_task ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE project_task FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_project_task ON project_task';
  EXECUTE 'CREATE POLICY tenant_isolation_project_task ON project_task USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

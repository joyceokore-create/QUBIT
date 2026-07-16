-- PRD Module 8 — project milestones.
CREATE TABLE "project_milestone" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_milestone_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_milestone_tenant_id_project_id_idx" ON "project_milestone"("tenant_id", "project_id");
ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DO $$
BEGIN
  EXECUTE 'ALTER TABLE project_milestone ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE project_milestone FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_project_milestone ON project_milestone';
  EXECUTE 'CREATE POLICY tenant_isolation_project_milestone ON project_milestone USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

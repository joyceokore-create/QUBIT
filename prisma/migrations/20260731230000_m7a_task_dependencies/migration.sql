-- M7-A (docs/16 §12) — task dependencies on the LIVE ProjectTask model. Distinct from
-- the legacy ClickUp task_dependency table, which belongs to the retired Task surface
-- and is dropped in M9. No backfill: dependencies are declared, never inferred.

CREATE TABLE "project_task_dependency" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "depends_on_task_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_task_dependency_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_task_dependency_task_id_depends_on_task_id_key" ON "project_task_dependency"("task_id", "depends_on_task_id");
CREATE INDEX "project_task_dependency_tenant_id_task_id_idx" ON "project_task_dependency"("tenant_id", "task_id");
ALTER TABLE "project_task_dependency" ADD CONSTRAINT "project_task_dependency_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_task_dependency" ADD CONSTRAINT "project_task_dependency_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "project_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_task_dependency" ADD CONSTRAINT "project_task_dependency_depends_on_task_id_fkey" FOREIGN KEY ("depends_on_task_id") REFERENCES "project_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- A task can never depend on itself; the deeper cycle check lives in the engine, where
-- it can walk the whole graph.
ALTER TABLE "project_task_dependency" ADD CONSTRAINT "project_task_dependency_no_self" CHECK ("task_id" <> "depends_on_task_id");

DO $$
BEGIN
  EXECUTE 'ALTER TABLE project_task_dependency ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE project_task_dependency FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_project_task_dependency ON project_task_dependency';
  EXECUTE 'CREATE POLICY tenant_isolation_project_task_dependency ON project_task_dependency
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

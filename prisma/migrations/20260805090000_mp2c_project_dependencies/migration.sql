-- M-P2c (docs/33) — cross-project dependencies, cycle-checked in the engine. RLS inline
-- (the M-O3 rule) + rls.sql resynced in the same change.
CREATE TABLE "project_dependency" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "depends_on_project_id" TEXT NOT NULL,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_dependency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_dependency_project_id_depends_on_project_id_key" ON "project_dependency"("project_id", "depends_on_project_id");
CREATE INDEX "project_dependency_tenant_id_idx" ON "project_dependency"("tenant_id");
CREATE INDEX "project_dependency_depends_on_project_id_idx" ON "project_dependency"("depends_on_project_id");

ALTER TABLE "project_dependency" ADD CONSTRAINT "project_dependency_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_dependency" ADD CONSTRAINT "project_dependency_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_dependency" ADD CONSTRAINT "project_dependency_depends_on_project_id_fkey" FOREIGN KEY ("depends_on_project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_dependency" ADD CONSTRAINT "project_dependency_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE project_dependency ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE project_dependency FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_project_dependency ON project_dependency';
  EXECUTE 'CREATE POLICY tenant_isolation_project_dependency ON project_dependency
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

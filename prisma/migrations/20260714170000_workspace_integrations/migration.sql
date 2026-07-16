-- Project Workspace phase 4 (config surface) — per-project integration connections.
CREATE TABLE "project_integration" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "resource" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_integration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_integration_project_id_provider_key" ON "project_integration"("project_id", "provider");
CREATE INDEX "project_integration_tenant_id_project_id_idx" ON "project_integration"("tenant_id", "project_id");
ALTER TABLE "project_integration" ADD CONSTRAINT "project_integration_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_integration" ADD CONSTRAINT "project_integration_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DO $$
BEGIN
  EXECUTE 'ALTER TABLE project_integration ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE project_integration FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_project_integration ON project_integration';
  EXECUTE 'CREATE POLICY tenant_isolation_project_integration ON project_integration USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

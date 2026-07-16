-- Project Workspace — attached documentation (BRD, plans, specs).
CREATE TABLE "project_document" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'Other',
    "format" TEXT NOT NULL DEFAULT 'text',
    "content" TEXT,
    "file_data" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Final',
    "source" TEXT NOT NULL DEFAULT 'Uploaded',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_document_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_document_tenant_id_project_id_idx" ON "project_document"("tenant_id", "project_id");
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE project_document ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE project_document FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_project_document ON project_document';
  EXECUTE 'CREATE POLICY tenant_isolation_project_document ON project_document USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

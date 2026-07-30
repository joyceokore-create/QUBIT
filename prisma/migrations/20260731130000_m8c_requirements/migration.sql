-- M8-C (docs/16 §6) — requirements with SOURCE ANCHORS and requirement→task coverage.
-- Extraction proposes candidates; only a human accepts, so nothing here backfills
-- requirements from existing documents. No DML, therefore no DM1.18 loop.

CREATE TABLE "requirement" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source_document_id" TEXT,
    "section_anchor" TEXT,
    "ref" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Accepted',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "requirement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "requirement_project_id_ref_key" ON "requirement"("project_id", "ref");
CREATE INDEX "requirement_tenant_id_project_id_idx" ON "requirement"("tenant_id", "project_id");
ALTER TABLE "requirement" ADD CONSTRAINT "requirement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "requirement" ADD CONSTRAINT "requirement_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "requirement" ADD CONSTRAINT "requirement_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "project_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "requirement" ADD CONSTRAINT "requirement_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "requirement_task_link" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "requirement_task_link_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "requirement_task_link_requirement_id_task_id_key" ON "requirement_task_link"("requirement_id", "task_id");
CREATE INDEX "requirement_task_link_tenant_id_task_id_idx" ON "requirement_task_link"("tenant_id", "task_id");
ALTER TABLE "requirement_task_link" ADD CONSTRAINT "requirement_task_link_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "requirement_task_link" ADD CONSTRAINT "requirement_task_link_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "requirement_task_link" ADD CONSTRAINT "requirement_task_link_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "project_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['requirement', 'requirement_task_link']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%1$s ON %1$I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%1$s ON %1$I
         USING (tenant_id = current_setting(''app.tenant_id'', true))
         WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      tbl
    );
  END LOOP;
END $$;

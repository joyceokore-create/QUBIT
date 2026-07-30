-- M2-B (docs/18 §5.1) — the member weekly report: auto-drafted Friday, edited by the
-- member, submitted to their project lead(s), acknowledged per project.
-- Both tables are tenant tables, so they get FORCE row-level security like every other.
-- No backfill: reports start accruing from the first Friday job run, so there is no DML
-- here and therefore no DM1.18 tenant loop to run.

CREATE TABLE "member_report" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "iso_week" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "draft" JSONB NOT NULL DEFAULT '{}',
    "narrative" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_report_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "member_report_tenant_id_user_id_iso_week_key" ON "member_report"("tenant_id", "user_id", "iso_week");
CREATE INDEX "member_report_tenant_id_iso_week_idx" ON "member_report"("tenant_id", "iso_week");
ALTER TABLE "member_report" ADD CONSTRAINT "member_report_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member_report" ADD CONSTRAINT "member_report_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "member_report_ack" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "member_report_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "acknowledged_by_id" TEXT NOT NULL,
    "comment" TEXT,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "member_report_ack_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "member_report_ack_member_report_id_project_id_key" ON "member_report_ack"("member_report_id", "project_id");
CREATE INDEX "member_report_ack_tenant_id_project_id_idx" ON "member_report_ack"("tenant_id", "project_id");
ALTER TABLE "member_report_ack" ADD CONSTRAINT "member_report_ack_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member_report_ack" ADD CONSTRAINT "member_report_ack_member_report_id_fkey" FOREIGN KEY ("member_report_id") REFERENCES "member_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_report_ack" ADD CONSTRAINT "member_report_ack_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_report_ack" ADD CONSTRAINT "member_report_ack_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['member_report', 'member_report_ack']
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

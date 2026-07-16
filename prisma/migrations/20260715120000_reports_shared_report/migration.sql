-- MVP1 reports centre — shareable point-in-time report snapshots.
CREATE TABLE "shared_report" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target_id" TEXT,
    "title" TEXT NOT NULL,
    "period_label" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "used_ai" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shared_report_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shared_report_token_key" ON "shared_report"("token");
CREATE INDEX "shared_report_tenant_id_created_at_idx" ON "shared_report"("tenant_id", "created_at");
ALTER TABLE "shared_report" ADD CONSTRAINT "shared_report_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shared_report" ADD CONSTRAINT "shared_report_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DO $$
BEGIN
  EXECUTE 'ALTER TABLE shared_report ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE shared_report FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_shared_report ON shared_report';
  EXECUTE 'CREATE POLICY tenant_isolation_shared_report ON shared_report USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

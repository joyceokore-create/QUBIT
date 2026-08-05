-- M-P3b (docs/34) — the Head of PMs' weekly roll-up. RLS inline (the M-O3 rule);
-- rls.sql resynced in the same change.
CREATE TABLE "portfolio_report" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "iso_week" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "narrative" TEXT,
    "payload" JSONB NOT NULL DEFAULT '[]',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "portfolio_report_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portfolio_report_tenant_id_iso_week_key" ON "portfolio_report"("tenant_id", "iso_week");

ALTER TABLE "portfolio_report" ADD CONSTRAINT "portfolio_report_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portfolio_report" ADD CONSTRAINT "portfolio_report_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE portfolio_report ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE portfolio_report FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_portfolio_report ON portfolio_report';
  EXECUTE 'CREATE POLICY tenant_isolation_portfolio_report ON portfolio_report
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

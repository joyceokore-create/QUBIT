-- M-D-B (docs/18 §3.1) — the weekly market check-in: one narrative + a RAG per
-- project × market track per ISO week. The track's % stays derived from checkpoint
-- state; this table holds only what a human must say. No backfill (check-ins accrue
-- from the first week they are written), so there is no DML and no DM1.18 loop here.

CREATE TABLE "market_check_in" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "org_unit_id" TEXT NOT NULL,
    "iso_week" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "rag" TEXT NOT NULL DEFAULT 'Green',
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "market_check_in_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "market_check_in_project_id_org_unit_id_iso_week_key" ON "market_check_in"("project_id", "org_unit_id", "iso_week");
CREATE INDEX "market_check_in_tenant_id_iso_week_idx" ON "market_check_in"("tenant_id", "iso_week");
ALTER TABLE "market_check_in" ADD CONSTRAINT "market_check_in_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "market_check_in" ADD CONSTRAINT "market_check_in_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_check_in" ADD CONSTRAINT "market_check_in_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_check_in" ADD CONSTRAINT "market_check_in_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE market_check_in ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE market_check_in FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_market_check_in ON market_check_in';
  EXECUTE 'CREATE POLICY tenant_isolation_market_check_in ON market_check_in
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

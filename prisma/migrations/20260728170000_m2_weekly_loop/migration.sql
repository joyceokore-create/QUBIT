-- Revamp M2 (docs/16-revamp-plan.md §7): the weekly loop — Friday check-ins and report
-- subscriptions. DDL only, so the DM1.18 production RLS gotcha cannot bite.

CREATE TABLE "check_in" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "iso_week" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "computed_rag" TEXT NOT NULL,
    "draft" JSONB NOT NULL DEFAULT '{}',
    "narrative" TEXT,
    "rag_override" TEXT,
    "override_reason" TEXT,
    "override_expires_at" TIMESTAMP(3),
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "check_in_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "check_in_tenant_id_project_id_iso_week_key" ON "check_in"("tenant_id", "project_id", "iso_week");
CREATE INDEX "check_in_tenant_id_iso_week_idx" ON "check_in"("tenant_id", "iso_week");
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "report_subscription" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'weekly_report',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "report_subscription_tenant_id_user_id_kind_key" ON "report_subscription"("tenant_id", "user_id", "kind");
ALTER TABLE "report_subscription" ADD CONSTRAINT "report_subscription_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_subscription" ADD CONSTRAINT "report_subscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['check_in', 'report_subscription']
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

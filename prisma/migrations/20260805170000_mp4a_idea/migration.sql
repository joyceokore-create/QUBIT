-- M-P4a (docs/35 §1, docs/26 §5.4) — idea intake & triage: the front of the funnel.
-- RLS inline (the M-O3 rule) + prisma/rls.sql resynced in the same change.
CREATE TABLE "idea" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sponsor" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "expected_value" TEXT,
    "submitted_by_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'New',
    "park_reason" TEXT,
    "suggested_portfolio_id" TEXT,
    "summary" TEXT,
    "accepted_project_id" TEXT,
    "merged_into_project_id" TEXT,
    "triaged_by_id" TEXT,
    "triaged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "idea_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idea_tenant_id_status_idx" ON "idea"("tenant_id", "status");
CREATE INDEX "idea_submitted_by_id_idx" ON "idea"("submitted_by_id");

ALTER TABLE "idea" ADD CONSTRAINT "idea_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idea" ADD CONSTRAINT "idea_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idea" ADD CONSTRAINT "idea_suggested_portfolio_id_fkey" FOREIGN KEY ("suggested_portfolio_id") REFERENCES "portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "idea" ADD CONSTRAINT "idea_accepted_project_id_fkey" FOREIGN KEY ("accepted_project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "idea" ADD CONSTRAINT "idea_merged_into_project_id_fkey" FOREIGN KEY ("merged_into_project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "idea" ADD CONSTRAINT "idea_triaged_by_id_fkey" FOREIGN KEY ("triaged_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE idea ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE idea FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_idea ON idea';
  EXECUTE 'CREATE POLICY tenant_isolation_idea ON idea
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

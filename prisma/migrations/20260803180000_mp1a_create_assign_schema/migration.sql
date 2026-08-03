-- M-P1a (docs/27 §2) — schema for the create & assign track.
--  * Portfolio.category / Programme.category: the business pipeline axis
--    (Approved | Exploring | Shelved), distinct from viewKind and delivery status.
--  * ProjectMember start/end dates: an assignment has a window (docs/26 §4.3).
--  * resource_request + team_template: staffing as a tracked flow.
-- RLS applied INLINE for both new tables (the M-O3 rule: migrations are what actually
-- run on the box). The category backfill runs INSIDE the tenant loop — portfolio and
-- programme are FORCE-RLS tables, and a bare UPDATE here matches zero rows (DM1.50).

ALTER TABLE "portfolio" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Exploring';
ALTER TABLE "programme" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Exploring';

ALTER TABLE "project_member" ADD COLUMN "start_date" TIMESTAMP(3);
ALTER TABLE "project_member" ADD COLUMN "end_date" TIMESTAMP(3);

CREATE TABLE "resource_request" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "raised_by_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "allocation_pct" INTEGER NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "resolved_by_id" TEXT,
    "resolved_note" TEXT,
    "filled_member_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "resource_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "resource_request_tenant_id_status_idx" ON "resource_request"("tenant_id", "status");
CREATE INDEX "resource_request_project_id_idx" ON "resource_request"("project_id");

ALTER TABLE "resource_request" ADD CONSTRAINT "resource_request_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resource_request" ADD CONSTRAINT "resource_request_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_request" ADD CONSTRAINT "resource_request_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resource_request" ADD CONSTRAINT "resource_request_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "team_template" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shape" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "team_template_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "team_template_tenant_id_name_key" ON "team_template"("tenant_id", "name");

ALTER TABLE "team_template" ADD CONSTRAINT "team_template_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE resource_request ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE resource_request FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_resource_request ON resource_request';
  EXECUTE 'CREATE POLICY tenant_isolation_resource_request ON resource_request
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
  EXECUTE 'ALTER TABLE team_template ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE team_template FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_team_template ON team_template';
  EXECUTE 'CREATE POLICY tenant_isolation_team_template ON team_template
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

-- Backfill (docs/27 §1.2): everything that exists at migration time is live delivery
-- work → Approved. New rows default to Exploring. Tenant loop, per DM1.18/DM1.50.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM tenant LOOP
    PERFORM set_config('app.tenant_id', t.id, true);
    UPDATE "portfolio" SET "category" = 'Approved';
    UPDATE "programme" SET "category" = 'Approved';
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END $$;

-- MVP1 PRD Module 10 — Blocker Register.

CREATE TABLE "blocker" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'Medium',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "owner_id" TEXT,
    "resolution_notes" TEXT,
    "date_raised" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "blocker_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "blocker_tenant_id_project_id_idx" ON "blocker"("tenant_id", "project_id");
ALTER TABLE "blocker" ADD CONSTRAINT "blocker_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "blocker" ADD CONSTRAINT "blocker_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blocker" ADD CONSTRAINT "blocker_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE blocker ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE blocker FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_blocker ON blocker';
  EXECUTE 'CREATE POLICY tenant_isolation_blocker ON blocker USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

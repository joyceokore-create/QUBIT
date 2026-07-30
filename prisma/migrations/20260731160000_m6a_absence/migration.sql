-- M6-A (docs/16 §5) — absence-aware capacity. One source-agnostic table: manual entry
-- ships now, a CSV/ICS bridge and a read-only ERP pull attach later without a schema
-- change. The ERP stays the system of record; QUBIT never writes leave back.
-- No backfill (absences accrue from first entry), so no DML and no DM1.18 loop.

ALTER TABLE "user" ADD COLUMN "capacity_hours_per_week" INTEGER NOT NULL DEFAULT 40;

CREATE TABLE "absence" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Leave',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "external_ref" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "absence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "absence_tenant_id_user_id_start_date_idx" ON "absence"("tenant_id", "user_id", "start_date");
ALTER TABLE "absence" ADD CONSTRAINT "absence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "absence" ADD CONSTRAINT "absence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "absence" ADD CONSTRAINT "absence_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE absence ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE absence FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_absence ON absence';
  EXECUTE 'CREATE POLICY tenant_isolation_absence ON absence
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

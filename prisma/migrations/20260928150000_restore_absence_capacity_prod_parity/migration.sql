-- Prod parity (2026-09-28). The production DB carries an out-of-band migration
-- (20260825132128_d1_drop_absence_add_report_lifecycle, deployed from a working tree that
-- was never pushed to GitHub) which dropped `absence` and `user.capacity_hours_per_week` —
-- both still read by this codebase (leave-aware workload, People, the PM allocation tile).
-- This migration restores them IDEMPOTENTLY: on databases that never saw that drop (local
-- dev, CI, fresh installs) every statement is a no-op. The out-of-band check_in lifecycle
-- columns are deliberately left in place — extra columns are invisible to the Prisma client.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "capacity_hours_per_week" INTEGER NOT NULL DEFAULT 40;

CREATE TABLE IF NOT EXISTS "absence" (
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

CREATE INDEX IF NOT EXISTS "absence_tenant_id_user_id_start_date_idx" ON "absence"("tenant_id", "user_id", "start_date");

-- ADD CONSTRAINT has no IF NOT EXISTS — guard via the catalog.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'absence_tenant_id_fkey') THEN
    ALTER TABLE "absence" ADD CONSTRAINT "absence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'absence_user_id_fkey') THEN
    ALTER TABLE "absence" ADD CONSTRAINT "absence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'absence_created_by_id_fkey') THEN
    ALTER TABLE "absence" ADD CONSTRAINT "absence_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Tenant isolation, exactly as 20260731160000_m6a_absence provisioned it.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE absence ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE absence FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_absence ON absence';
  EXECUTE 'CREATE POLICY tenant_isolation_absence ON absence
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

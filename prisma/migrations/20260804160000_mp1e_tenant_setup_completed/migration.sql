-- M-P1e (docs/31) — org-setup wizard completion stamp. The tenant table is NOT
-- tenant-scoped (no RLS), so plain DML is correct here. Existing tenants were stood up
-- by script/seed — stamp them so the wizard banner only greets genuinely new tenants.
ALTER TABLE "tenant" ADD COLUMN "setup_completed_at" TIMESTAMP(3);
UPDATE "tenant" SET "setup_completed_at" = now();

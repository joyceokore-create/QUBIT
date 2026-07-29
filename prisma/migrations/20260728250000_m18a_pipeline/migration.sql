-- M18-A (docs/18 §1/§7): pipeline stage + one-line status note, and the priority enum
-- extended to business usage (High | Med | Low | New | Strat | Paused). The columns are
-- additive DDL; the priority value remap is tenant-table DML and therefore MUST run in
-- the DM1.18 tenant loop — with FORCE RLS and no app.tenant_id it would silently match
-- zero rows in production.

ALTER TABLE "project" ADD COLUMN "pipeline_stage" TEXT NOT NULL DEFAULT 'Exploring';
ALTER TABLE "project" ADD COLUMN "status_note" TEXT;

-- Legacy priority values → the docs/18 enum: Medium → Med, Critical → High (the new
-- enum carries no Critical; High is the faithful downmap). Verified live values on
-- 2026-07-28: {High, Critical, Medium} in kcb, {Medium} in riverbank.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM tenant LOOP
    PERFORM set_config('app.tenant_id', t.id, true);
    UPDATE project SET priority = 'Med' WHERE priority = 'Medium';
    UPDATE project SET priority = 'High' WHERE priority = 'Critical';
  END LOOP;
END $$;

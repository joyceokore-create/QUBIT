-- M-P1a follow-up: "Standard build" must exist for ALREADY-DEPLOYED tenants too — prod
-- never runs the dev seed (the M-D-A checkpoint-template precedent). Idempotent: skips
-- any tenant that already has a template of that name. Tenant loop per DM1.18/DM1.50.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM tenant LOOP
    PERFORM set_config('app.tenant_id', t.id, true);
    INSERT INTO team_template (id, tenant_id, name, shape, created_at, updated_at)
    SELECT gen_random_uuid()::text, t.id, 'Standard build',
      '[{"role":"Project Manager","allocationPct":20},
        {"role":"Technical Lead","allocationPct":40},
        {"role":"Developer","allocationPct":60},
        {"role":"Developer","allocationPct":60},
        {"role":"QA Engineer","allocationPct":60},
        {"role":"Implementor","allocationPct":50}]'::jsonb,
      now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM team_template WHERE name = 'Standard build');
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END $$;

-- M18-B (docs/18 §0 decision 5 + §3.0, amended 2026-07-28): every project belongs to a
-- portfolio. Adds Portfolio.view_kind, seeds a default "Unassigned" portfolio per
-- tenant, and backfills portfolio-less projects into it. The inserts/updates touch
-- tenant tables under FORCE RLS, so they MUST run inside the DM1.18 tenant loop —
-- unscoped they would silently match zero rows in production.

ALTER TABLE "portfolio" ADD COLUMN "view_kind" TEXT NOT NULL DEFAULT 'Pipeline';

DO $$
DECLARE
  t record;
  unassigned_id text;
BEGIN
  FOR t IN SELECT id FROM tenant LOOP
    PERFORM set_config('app.tenant_id', t.id, true);

    SELECT id INTO unassigned_id FROM portfolio WHERE name = 'Unassigned' LIMIT 1;
    IF unassigned_id IS NULL THEN
      unassigned_id := gen_random_uuid()::text;
      INSERT INTO portfolio (id, tenant_id, name, description, view_kind, created_at, updated_at)
      VALUES (
        unassigned_id,
        t.id,
        'Unassigned',
        'Default portfolio — projects awaiting a portfolio decision (docs/18 §0.5).',
        'Pipeline',
        now(),
        now()
      );
    END IF;

    UPDATE project SET portfolio_id = unassigned_id WHERE portfolio_id IS NULL;
  END LOOP;
END $$;

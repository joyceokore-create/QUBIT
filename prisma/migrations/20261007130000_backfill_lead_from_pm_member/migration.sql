-- First-week onboarding fix-up (2026-10-07): PMs were attached to their projects as
-- "Project Manager" members through the Team tab, which never set the project lead — and
-- the PM dashboard, the Head's inbox, the digest and the PDF header all read the lead.
-- From now on the first Project Manager assigned to a lead-less project becomes its lead
-- (src/server/resources.ts); this backfills the projects assigned before that rule.
-- Per tenant under app.tenant_id — the DM1.18 trap: a bare UPDATE on a FORCE-RLS table
-- matches zero rows for the migration role. Idempotent: only lead-less projects.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM tenant LOOP
    PERFORM set_config('app.tenant_id', t.id, true);
    UPDATE "project" p
    SET "lead_user_id" = (
      SELECT m."user_id" FROM "project_member" m
      WHERE m."project_id" = p."id" AND m."role" = 'Project Manager'
      ORDER BY m."created_at" ASC LIMIT 1
    )
    WHERE p."lead_user_id" IS NULL
      AND EXISTS (SELECT 1 FROM "project_member" m WHERE m."project_id" = p."id" AND m."role" = 'Project Manager');
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END $$;

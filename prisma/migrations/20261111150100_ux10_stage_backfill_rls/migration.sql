-- UX10 — the stage_entered_at backfill, run per tenant UNDER RLS. The previous migration's
-- plain UPDATE touches no rows because "project" and "audit_log" FORCE row-level security and
-- the migration role doesn't bypass it. Here each tenant's context is set first (the same
-- `app.tenant_id` setting withTenant uses), so the policy admits that tenant's rows only.
-- "tenant" itself has no RLS, so it can be listed. Idempotent: only NULL rows are filled.
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT "id" FROM "tenant" LOOP
    PERFORM set_config('app.tenant_id', t."id", true);
    UPDATE "project" p
    SET "stage_entered_at" = COALESCE(
      (
        SELECT max(a."created_at")
        FROM "audit_log" a
        WHERE a."tenant_id" = p."tenant_id"
          AND a."entity_type" = 'project'
          AND a."entity_id" = p."id"
          AND a."action" = 'update'
          AND (
            (a."before"->>'pipelineStage') IS DISTINCT FROM (a."after"->>'pipelineStage')
            OR (
              (a."before"->>'status') IS DISTINCT FROM (a."after"->>'status')
              AND ((a."before"->>'status') IN ('Completed', 'Cancelled') OR (a."after"->>'status') IN ('Completed', 'Cancelled'))
            )
          )
      ),
      p."created_at"
    )
    WHERE p."stage_entered_at" IS NULL;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END $$;

-- QUBIT Row-Level Security policies. See docs/04-multitenancy.md.
-- Applied to every tenant-owned table. "tenant" itself is NOT tenant-scoped and has no policy.
-- current_setting('app.tenant_id', true) returns NULL when unset, which denies all rows —
-- the safe default when a query runs outside withTenant().

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'org_unit',
    'user',
    'role_assignment',
    'portfolio',
    'programme',
    'project',
    'project_org_status',
    'milestone',
    'risk',
    'issue',
    'audit_log'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_isolation_%1$s ON %1$I',
      tbl
    );
    -- tenant_id is Prisma's default `text` id type (not native uuid), so compare as text.
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%1$s ON %1$I
         USING (tenant_id = current_setting(''app.tenant_id'', true))
         WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      tbl
    );
  END LOOP;
END $$;

-- QUBIT Row-Level Security policies. See docs/04-multitenancy.md.
-- Applied to every tenant-owned table. "tenant" itself is NOT tenant-scoped and has no policy.
-- current_setting('app.tenant_id', true) returns NULL when unset, which denies all rows —
-- the safe default when a query runs outside withTenant().

-- NOT tenant-scoped (intentional, like "tenant"): access_request captures pre-tenant
-- intake ("Get started" lead capture), so it carries no tenant_id and is deliberately
-- excluded from the table array below. Access is gated by RBAC (iam:manage) in the app
-- layer, not by RLS. See docs/04-multitenancy.md.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'org_unit',
    'user',
    'role_assignment',
    'department',
    'portfolio',
    'programme',
    'project',
    'project_org_status',
    'milestone',
    'risk',
    'issue',
    'audit_log',
    -- ClickUp transformation (docs/clickup-transformation) — every new tenant-owned
    -- table carries tenant_id and the same isolation policy (incl. join tables, for
    -- defense-in-depth — see DECISIONS.md).
    'space',
    'folder',
    'list',
    'status_group',
    'status',
    'task',
    'task_dependency',
    'tag',
    'task_tag',
    'task_assignee',
    'task_watcher',
    'activity',
    'checklist',
    'checklist_item',
    'comment',
    'field_definition',
    'field_value',
    'view',
    'time_entry',
    'automation',
    'automation_run',
    'team',
    'team_member',
    'project_member',
    'project_team',
    -- MVP1 Q copilot (Phase C) — metrics only, still tenant-scoped.
    'ai_call_log',
    -- MVP1 PRD Modules 5–7 — executable project tasks.
    'project_task',
    'blocker',
    'project_document',
    'notification',
    'project_integration',
    'project_milestone',
    'project_status_update',
    'shared_report',
    -- Phase 1.5 — tenant-editable role → permission grants.
    'role_permission',
    -- Phase 5 — project join requests.
    'join_request',
    -- Phase 6.1 — per-project task-key sequence (docs/15).
    'project_task_counter'
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

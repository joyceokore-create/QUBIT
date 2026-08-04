-- QUBIT Row-Level Security policies. See docs/04-multitenancy.md.
-- Applied to every tenant-owned table. "tenant" itself is NOT tenant-scoped and has no policy.
-- current_setting('app.tenant_id', true) returns NULL when unset, which denies all rows —
-- the safe default when a query runs outside withTenant().

-- DRIFT NOTE (M-O3, 2026-08-03): this array had fallen 15 tables behind — every table
-- created since M4 applies its own ENABLE/FORCE + policy inline in its migration (the
-- DM1.18 pattern), so the live database was never unprotected, but this file had stopped
-- being a complete statement of policy. It is now back in sync; a new table must be added
-- BOTH in its migration and here.

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
    'project_task_counter',
    -- Revamp M0/M1 — domain-event outbox + nightly snapshots (docs/16-revamp-plan.md §10).
    -- job_run is deliberately NOT tenant-scoped (dispatcher observability, like
    -- access_request). The legacy 'milestone' table merged into project_milestone in M1.
    'domain_event',
    'project_snapshot',
    'portfolio_snapshot',
    -- Revamp M2 — the weekly loop.
    'check_in',
    'report_subscription',
    -- Revamp M3 — the nudger.
    'nudge',
    'nudge_snooze',
    -- Revamp M4 — conversation attached to work.
    'work_comment',
    'decision',
    -- Revamp M5 — digest-first email preferences.
    'notification_preference',
    -- Revamp M6 — absence & leave-aware capacity.
    'absence',
    -- Revamp M2-B — member weekly reports.
    'member_report',
    'member_report_ack',
    -- docs/18 M-D — checkpoint templates, gate states, market check-ins.
    'checkpoint_template',
    'checkpoint',
    'checkpoint_status',
    'market_check_in',
    -- Revamp M8 — document approvals, requirements traceability, closure lessons.
    'document_approval',
    'requirement',
    'requirement_task_link',
    'lesson_learned',
    -- Revamp M7 — task dependencies + GitHub commit automation.
    'project_task_dependency',
    'task_commit_link',
    'webhook_delivery',
    -- M-O3 — invite/reset tokens (docs/22).
    'invite_token',
    -- M-P1a (docs/27) — staffing as a tracked flow.
    'resource_request',
    'team_template',
    -- M-P2c (docs/33) — cross-project dependencies.
    'project_dependency'
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

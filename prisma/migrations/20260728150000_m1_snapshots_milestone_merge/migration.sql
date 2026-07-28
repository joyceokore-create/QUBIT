-- Revamp M1 (docs/16-revamp-plan.md): nightly snapshots, delta-feed last-seen marker,
-- and the milestone model merge (legacy per-subsidiary `milestone` → `project_milestone`).
-- The data copy follows the DM1.18 rule: tenant-table DML runs inside a tenant loop that
-- sets app.tenant_id per tenant, because FORCE RLS silently no-ops unscoped DML in prod.

-- ── Delta feed marker ────────────────────────────────────────────────────────
ALTER TABLE "user" ADD COLUMN "last_dashboard_seen_at" TIMESTAMP(3);

-- ── Snapshot tables (tenant-scoped + FORCE RLS) ─────────────────────────────
CREATE TABLE "project_snapshot" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "rag" TEXT NOT NULL,
    "progress" INTEGER NOT NULL,
    "tasks_open" INTEGER NOT NULL,
    "tasks_completed" INTEGER NOT NULL,
    "tasks_overdue" INTEGER NOT NULL,
    "blockers_open" INTEGER NOT NULL,
    "risks_open" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_snapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_snapshot_tenant_id_project_id_day_key" ON "project_snapshot"("tenant_id", "project_id", "day");
CREATE INDEX "project_snapshot_tenant_id_day_idx" ON "project_snapshot"("tenant_id", "day");
ALTER TABLE "project_snapshot" ADD CONSTRAINT "project_snapshot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_snapshot" ADD CONSTRAINT "project_snapshot_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "portfolio_snapshot" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "projects" INTEGER NOT NULL,
    "on_track" INTEGER NOT NULL,
    "need_attention" INTEGER NOT NULL,
    "planning" INTEGER NOT NULL,
    "on_track_pct" INTEGER NOT NULL,
    "tasks_overdue" INTEGER NOT NULL,
    "people_allocated" INTEGER NOT NULL,
    "people_over_allocated" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "portfolio_snapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "portfolio_snapshot_tenant_id_day_key" ON "portfolio_snapshot"("tenant_id", "day");
ALTER TABLE "portfolio_snapshot" ADD CONSTRAINT "portfolio_snapshot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['project_snapshot', 'portfolio_snapshot']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%1$s ON %1$I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%1$s ON %1$I
         USING (tenant_id = current_setting(''app.tenant_id'', true))
         WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      tbl
    );
  END LOOP;
END $$;

-- ── Milestone merge: legacy `milestone` (per ProjectOrgStatus) → `project_milestone` ──
-- Org-unit context can't be modelled on project_milestone, so it is baked into the name
-- ("🇰🇪 KCB Kenya UAT"). state mapping: done → Done; active/late/pending → Pending
-- ("late" is DERIVED in the new model: Pending + past due date). Ids are preserved so a
-- re-run is a no-op (ON CONFLICT DO NOTHING) and external references stay stable.
-- DM1.18: per-tenant set_config so the SELECT and INSERT both see rows under FORCE RLS.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM tenant LOOP
    PERFORM set_config('app.tenant_id', t.id, true);
    INSERT INTO project_milestone (id, tenant_id, project_id, name, due_date, status, order_index, created_at, updated_at)
    SELECT
      m.id,
      m.tenant_id,
      pos.project_id,
      trim(regexp_replace(concat_ws(' ', ou.flag, ou.name, m.name), '\s+', ' ', 'g')),
      m.due_date,
      CASE WHEN m.state = 'done' THEN 'Done' ELSE 'Pending' END,
      m.sequence,
      m.created_at,
      m.updated_at
    FROM milestone m
    JOIN project_org_status pos ON pos.id = m.project_org_status_id
    JOIN org_unit ou ON ou.id = pos.org_unit_id
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- One concept, one model: the legacy table goes now (it is not part of the M9 ClickUp
-- batch). DDL is unaffected by RLS.
DROP TABLE "milestone";

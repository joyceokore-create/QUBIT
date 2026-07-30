-- M-D-A (docs/18 §2 + §3.1) — delivery checkpoints as data, and markets as a kind of
-- org unit. Checkpoint state is tracked per unit of tracking: the project itself
-- (org_unit_id IS NULL, the pipeline lens) or a project × market track (rollout lens).
-- The seven KCB markets are seeded into the Riverbank tenant per §3.1; that INSERT and
-- the org-unit backfill touch tenant tables under FORCE RLS, so both run inside the
-- DM1.18 tenant loop.

ALTER TABLE "org_unit" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'Internal';

CREATE TABLE "checkpoint_template" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "checkpoint_template_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "checkpoint_template_tenant_id_name_key" ON "checkpoint_template"("tenant_id", "name");
ALTER TABLE "checkpoint_template" ADD CONSTRAINT "checkpoint_template_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "checkpoint" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "checkpoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "checkpoint_template_id_name_key" ON "checkpoint"("template_id", "name");
CREATE INDEX "checkpoint_tenant_id_template_id_idx" ON "checkpoint"("tenant_id", "template_id");
ALTER TABLE "checkpoint" ADD CONSTRAINT "checkpoint_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checkpoint" ADD CONSTRAINT "checkpoint_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checkpoint_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "checkpoint_status" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "checkpoint_id" TEXT NOT NULL,
    "org_unit_id" TEXT,
    "state" TEXT NOT NULL DEFAULT 'NotStarted',
    "blocker_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "checkpoint_status_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "checkpoint_status_project_id_checkpoint_id_org_unit_id_key" ON "checkpoint_status"("project_id", "checkpoint_id", "org_unit_id");
-- Postgres treats NULLs as distinct, so the composite unique above does NOT stop two
-- project-level rows for the same checkpoint. Pin that case explicitly.
CREATE UNIQUE INDEX "checkpoint_status_project_checkpoint_self_key" ON "checkpoint_status"("project_id", "checkpoint_id") WHERE "org_unit_id" IS NULL;
CREATE INDEX "checkpoint_status_tenant_id_project_id_idx" ON "checkpoint_status"("tenant_id", "project_id");
ALTER TABLE "checkpoint_status" ADD CONSTRAINT "checkpoint_status_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checkpoint_status" ADD CONSTRAINT "checkpoint_status_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkpoint_status" ADD CONSTRAINT "checkpoint_status_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "checkpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkpoint_status" ADD CONSTRAINT "checkpoint_status_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkpoint_status" ADD CONSTRAINT "checkpoint_status_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "blocker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project" ADD COLUMN "checkpoint_template_id" TEXT;
ALTER TABLE "project" ADD CONSTRAINT "project_checkpoint_template_id_fkey" FOREIGN KEY ("checkpoint_template_id") REFERENCES "checkpoint_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['checkpoint_template', 'checkpoint', 'checkpoint_status']
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

-- ── DM1.18 tenant loop: seed the two §2 templates for every tenant, and the seven
-- §3.1 market org units for Riverbank. Unscoped these would silently match zero rows.
DO $$
DECLARE
  t record;
  tmpl_id text;
  cp text;
  idx int;
  product_gates text[] := ARRAY['BRD','Prototype','MVP1','SIT','UAT','Go-Live'];
  rollout_gates text[] := ARRAY['Business Case','Contract','Solution Build','Bank Integration','Telco Integration','Testing','GTM/Pilot','Rollout'];
  m record;
BEGIN
  FOR t IN SELECT id, slug FROM tenant LOOP
    PERFORM set_config('app.tenant_id', t.id, true);

    -- Product build template
    SELECT id INTO tmpl_id FROM checkpoint_template WHERE name = 'Product build' LIMIT 1;
    IF tmpl_id IS NULL THEN
      tmpl_id := gen_random_uuid()::text;
      INSERT INTO checkpoint_template (id, tenant_id, name, description, created_at, updated_at)
      VALUES (tmpl_id, t.id, 'Product build', 'Build-out gates for a product or platform (docs/18 §2).', now(), now());
      idx := 0;
      FOREACH cp IN ARRAY product_gates LOOP
        INSERT INTO checkpoint (id, tenant_id, template_id, name, order_index)
        VALUES (gen_random_uuid()::text, t.id, tmpl_id, cp, idx);
        idx := idx + 1;
      END LOOP;
    END IF;

    -- Market rollout template
    SELECT id INTO tmpl_id FROM checkpoint_template WHERE name = 'Market rollout' LIMIT 1;
    IF tmpl_id IS NULL THEN
      tmpl_id := gen_random_uuid()::text;
      INSERT INTO checkpoint_template (id, tenant_id, name, description, created_at, updated_at)
      VALUES (tmpl_id, t.id, 'Market rollout', 'Gates for taking a product into a market (docs/18 §2).', now(), now());
      idx := 0;
      FOREACH cp IN ARRAY rollout_gates LOOP
        INSERT INTO checkpoint (id, tenant_id, template_id, name, order_index)
        VALUES (gen_random_uuid()::text, t.id, tmpl_id, cp, idx);
        idx := idx + 1;
      END LOOP;
    END IF;

    -- §3.1: the seven markets belong to the Riverbank tenant. Existing org units stay
    -- Internal (the column default already did that).
    IF t.slug = 'riverbank' THEN
      FOR m IN
        SELECT * FROM (VALUES
          ('KE','Kenya','🇰🇪'), ('TZ','Tanzania','🇹🇿'), ('UG','Uganda','🇺🇬'),
          ('RW','Rwanda','🇷🇼'), ('BI','Burundi','🇧🇮'), ('SS','South Sudan','🇸🇸'),
          ('DRC','DR Congo','🇨🇩')
        ) AS v(code, name, flag)
      LOOP
        IF NOT EXISTS (SELECT 1 FROM org_unit WHERE code = m.code) THEN
          INSERT INTO org_unit (id, tenant_id, code, name, flag, kind, created_at, updated_at)
          VALUES (gen_random_uuid()::text, t.id, m.code, m.name, m.flag, 'Market', now(), now());
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

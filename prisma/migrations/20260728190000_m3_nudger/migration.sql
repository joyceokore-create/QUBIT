-- Revamp M3 (docs/16-revamp-plan.md §12; matrix from docs/15 §6.4): the nudger.
-- DDL only — no DML, so the DM1.18 production RLS gotcha cannot bite.

CREATE TABLE "nudge" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "project_id" TEXT,
    "iso_week" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "escalation_level" INTEGER NOT NULL DEFAULT 0,
    "recipient_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "nudge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "nudge_tenant_id_dedupe_key_key" ON "nudge"("tenant_id", "dedupe_key");
CREATE INDEX "nudge_tenant_id_iso_week_idx" ON "nudge"("tenant_id", "iso_week");
ALTER TABLE "nudge" ADD CONSTRAINT "nudge_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nudge" ADD CONSTRAINT "nudge_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "nudge_snooze" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nudge_snooze_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "nudge_snooze_tenant_id_user_id_entity_id_signal_key" ON "nudge_snooze"("tenant_id", "user_id", "entity_id", "signal");
ALTER TABLE "nudge_snooze" ADD CONSTRAINT "nudge_snooze_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nudge_snooze" ADD CONSTRAINT "nudge_snooze_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['nudge', 'nudge_snooze']
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

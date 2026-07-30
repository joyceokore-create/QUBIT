-- M8-A (docs/16 §6) — gate checklists and lessons learned. Gates SOFT-block: a
-- checkpoint can still be closed with unmet requirements, but the reason, the person
-- and the moment are recorded on the row, so an override is visible forever.
-- No backfill (existing gates simply have no override), so no DML and no DM1.18 loop.

ALTER TABLE "checkpoint_status" ADD COLUMN "override_reason" TEXT;
ALTER TABLE "checkpoint_status" ADD COLUMN "overridden_by_id" TEXT;
ALTER TABLE "checkpoint_status" ADD COLUMN "overridden_at" TIMESTAMP(3);
ALTER TABLE "checkpoint_status" ADD CONSTRAINT "checkpoint_status_overridden_by_id_fkey" FOREIGN KEY ("overridden_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "lesson_learned" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Recommendation',
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lesson_learned_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lesson_learned_tenant_id_project_id_idx" ON "lesson_learned"("tenant_id", "project_id");
ALTER TABLE "lesson_learned" ADD CONSTRAINT "lesson_learned_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lesson_learned" ADD CONSTRAINT "lesson_learned_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_learned" ADD CONSTRAINT "lesson_learned_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE lesson_learned ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE lesson_learned FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_lesson_learned ON lesson_learned';
  EXECUTE 'CREATE POLICY tenant_isolation_lesson_learned ON lesson_learned
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

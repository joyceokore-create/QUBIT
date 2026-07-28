-- Revamp M4 (docs/16-revamp-plan.md §4): conversation attached to work — polymorphic
-- threaded comments with @mentions, and the Decision log (the missing "D" in RAID).
-- DDL only, so the DM1.18 production RLS gotcha cannot bite. The table is named
-- work_comment because the dead ClickUp "comment" table survives until the M9 drop.

CREATE TABLE "work_comment" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "project_id" TEXT,
    "parent_id" TEXT,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decision_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_comment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_comment_tenant_id_entity_type_entity_id_created_at_idx" ON "work_comment"("tenant_id", "entity_type", "entity_id", "created_at");
CREATE INDEX "work_comment_tenant_id_project_id_idx" ON "work_comment"("tenant_id", "project_id");
ALTER TABLE "work_comment" ADD CONSTRAINT "work_comment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_comment" ADD CONSTRAINT "work_comment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_comment" ADD CONSTRAINT "work_comment_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "work_comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_comment" ADD CONSTRAINT "work_comment_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "decision" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_comment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "decision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "decision_tenant_id_project_id_decided_at_idx" ON "decision"("tenant_id", "project_id", "decided_at");
ALTER TABLE "decision" ADD CONSTRAINT "decision_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision" ADD CONSTRAINT "decision_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "decision" ADD CONSTRAINT "decision_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['work_comment', 'decision']
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

-- CreateEnum
CREATE TYPE "ViewType" AS ENUM ('LIST', 'BOARD', 'CALENDAR', 'GANTT', 'TABLE', 'TIMELINE', 'WORKLOAD', 'MINDMAP');

-- CreateTable
CREATE TABLE "view" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_type" "LocationType" NOT NULL,
    "location_id" TEXT,
    "type" "ViewType" NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "share_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "view_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "view_share_token_key" ON "view"("share_token");

-- CreateIndex
CREATE INDEX "view_tenant_id_location_type_location_id_idx" ON "view"("tenant_id", "location_type", "location_id");

-- AddForeignKey
ALTER TABLE "view" ADD CONSTRAINT "view_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security (docs/04-multitenancy.md) — with the view table. Idempotent.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'org_unit', 'user', 'role_assignment', 'department', 'portfolio', 'programme',
    'project', 'project_org_status', 'milestone', 'risk', 'issue', 'audit_log',
    'space', 'folder', 'list', 'status_group', 'status', 'task', 'task_dependency',
    'tag', 'task_tag', 'task_assignee', 'task_watcher', 'activity',
    'checklist', 'checklist_item', 'comment', 'field_definition', 'field_value', 'view'
  ]
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

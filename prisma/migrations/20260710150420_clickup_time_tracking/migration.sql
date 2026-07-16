-- CreateTable
CREATE TABLE "time_entry" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3),
    "duration_min" INTEGER,
    "note" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_entry_tenant_id_user_id_start_idx" ON "time_entry"("tenant_id", "user_id", "start");

-- AddForeignKey
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security (docs/04-multitenancy.md) — with the time_entry table. Idempotent.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'org_unit', 'user', 'role_assignment', 'department', 'portfolio', 'programme',
    'project', 'project_org_status', 'milestone', 'risk', 'issue', 'audit_log',
    'space', 'folder', 'list', 'status_group', 'status', 'task', 'task_dependency',
    'tag', 'task_tag', 'task_assignee', 'task_watcher', 'activity',
    'checklist', 'checklist_item', 'comment', 'field_definition', 'field_value', 'view', 'time_entry'
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

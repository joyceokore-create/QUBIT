-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'MONEY', 'DATE', 'DROPDOWN', 'LABELS', 'CHECKBOX', 'URL', 'EMAIL', 'PHONE', 'PEOPLE', 'RATING', 'PROGRESS_AUTO', 'PROGRESS_MANUAL', 'FORMULA', 'RELATIONSHIP', 'FILES', 'AI');

-- CreateTable
CREATE TABLE "field_definition" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_type" "LocationType" NOT NULL,
    "location_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order_index" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_value" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "field_value_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_definition_tenant_id_location_type_location_id_idx" ON "field_definition"("tenant_id", "location_type", "location_id");

-- CreateIndex
CREATE INDEX "field_value_tenant_id_task_id_idx" ON "field_value"("tenant_id", "task_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_value_task_id_field_id_key" ON "field_value"("task_id", "field_id");

-- AddForeignKey
ALTER TABLE "field_definition" ADD CONSTRAINT "field_definition_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_value" ADD CONSTRAINT "field_value_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_value" ADD CONSTRAINT "field_value_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_value" ADD CONSTRAINT "field_value_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "field_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security (docs/04-multitenancy.md) — with custom-field tables. Idempotent.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'org_unit', 'user', 'role_assignment', 'department', 'portfolio', 'programme',
    'project', 'project_org_status', 'milestone', 'risk', 'issue', 'audit_log',
    'space', 'folder', 'list', 'status_group', 'status', 'task', 'task_dependency',
    'tag', 'task_tag', 'task_assignee', 'task_watcher', 'activity',
    'checklist', 'checklist_item', 'comment', 'field_definition', 'field_value'
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

-- Phase 1.5 — tenant-editable role → permission grants. Empty by default (every role uses
-- its code default until an admin customises it). Tenant-scoped + FORCE RLS like every other
-- tenant-owned table.
CREATE TABLE "role_permission" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "role_permission_tenant_id_role_permission_key" ON "role_permission"("tenant_id", "role", "permission");
CREATE INDEX "role_permission_tenant_id_role_idx" ON "role_permission"("tenant_id", "role");
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE role_permission ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE role_permission FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_role_permission ON role_permission';
  EXECUTE 'CREATE POLICY tenant_isolation_role_permission ON role_permission USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

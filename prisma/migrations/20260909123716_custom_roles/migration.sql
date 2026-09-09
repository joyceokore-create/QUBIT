-- CreateTable
CREATE TABLE "custom_role" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "deactivation_reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_role_tenant_id_status_idx" ON "custom_role"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "custom_role_tenant_id_name_key" ON "custom_role"("tenant_id", "name");

-- AddForeignKey
ALTER TABLE "custom_role" ADD CONSTRAINT "custom_role_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE custom_role ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE custom_role FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_custom_role ON custom_role';
  EXECUTE 'CREATE POLICY tenant_isolation_custom_role ON custom_role
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

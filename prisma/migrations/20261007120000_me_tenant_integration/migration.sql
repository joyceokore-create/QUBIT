-- Configs › Integrations redesign — one YouTrack instance + one token per tenant. Projects
-- map to it per-project (project_integration.resource = the YouTrack key). RLS'd inline like
-- every tenant table since M4, and also listed in prisma/rls.sql.

-- CreateTable
CREATE TABLE "tenant_integration" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "connected_user" TEXT,
    "connected_name" TEXT,
    "token_last4" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "last_checked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_integration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_integration_tenant_id_idx" ON "tenant_integration"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_integration_tenant_id_provider_key" ON "tenant_integration"("tenant_id", "provider");

-- AddForeignKey
ALTER TABLE "tenant_integration" ADD CONSTRAINT "tenant_integration_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE tenant_integration ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE tenant_integration FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_tenant_integration ON tenant_integration';
  EXECUTE 'CREATE POLICY tenant_isolation_tenant_integration ON tenant_integration
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

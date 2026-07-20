-- Project join requests (PROMPT §2/§5/§6). Tenant-scoped + FORCE RLS like every tenant table.
CREATE TABLE "join_request" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "requested_role" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "join_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "join_request_tenant_id_project_id_status_idx" ON "join_request"("tenant_id", "project_id", "status");
CREATE INDEX "join_request_tenant_id_user_id_idx" ON "join_request"("tenant_id", "user_id");
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE join_request ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE join_request FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_join_request ON join_request';
  EXECUTE 'CREATE POLICY tenant_isolation_join_request ON join_request USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

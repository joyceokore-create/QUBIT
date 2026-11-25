-- In-product assistant (plan Phase 5): one row per assistant session, whose id is the
-- signed delegation token Lumi presents to /api/assistant/v1/* (revocable), and audit_log.via
-- so changes made through the assistant are marked as such. RLS inline, listed in prisma/rls.sql.

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "via" TEXT;

-- CreateTable
CREATE TABLE "assistant_session" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "lumi_session_id" TEXT,
    "lumi_session_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_session_tenant_id_user_id_expires_at_idx" ON "assistant_session"("tenant_id", "user_id", "expires_at");

-- AddForeignKey
ALTER TABLE "assistant_session" ADD CONSTRAINT "assistant_session_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_session" ADD CONSTRAINT "assistant_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE assistant_session ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE assistant_session FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_assistant_session ON assistant_session';
  EXECUTE 'CREATE POLICY tenant_isolation_assistant_session ON assistant_session
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;


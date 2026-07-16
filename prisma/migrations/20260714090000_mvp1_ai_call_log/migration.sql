-- MVP1 Phase C — Q copilot call log. Metrics only (no prompt/report content, no PII).

-- CreateTable
CREATE TABLE "ai_call_log" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "used_ai" BOOLEAN NOT NULL DEFAULT true,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_call_log_tenant_id_created_at_idx" ON "ai_call_log"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call_log" ADD CONSTRAINT "ai_call_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security (docs/04-multitenancy.md). Idempotent — enables + forces RLS and
-- (re)creates the tenant-isolation policy for ai_call_log.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE ai_call_log ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE ai_call_log FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_ai_call_log ON ai_call_log';
  EXECUTE 'CREATE POLICY tenant_isolation_ai_call_log ON ai_call_log USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

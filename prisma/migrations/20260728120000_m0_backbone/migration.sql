-- Revamp M0 backbone (docs/16-revamp-plan.md §10): domain-event outbox + job-run
-- observability. DDL only — no DML, so the DM1.18 production RLS gotcha cannot bite.

-- Domain-event outbox: tenant-scoped + FORCE RLS like every tenant table.
CREATE TABLE "domain_event" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "domain_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "domain_event_tenant_id_created_at_idx" ON "domain_event"("tenant_id", "created_at");
CREATE INDEX "domain_event_tenant_id_entity_type_entity_id_idx" ON "domain_event"("tenant_id", "entity_type", "entity_id");
ALTER TABLE "domain_event" ADD CONSTRAINT "domain_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE domain_event ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE domain_event FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_domain_event ON domain_event';
  EXECUTE 'CREATE POLICY tenant_isolation_domain_event ON domain_event USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

-- Job-run observability: deliberately NOT tenant-scoped (like tenant/access_request) —
-- the cron dispatcher runs outside any tenant context and must record a run even when a
-- tenant loop fails. Per-tenant outcomes live in "detail"; access is superadmin-only in
-- the app layer.
CREATE TABLE "job_run" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "error" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "job_run_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "job_run_idempotency_key_key" ON "job_run"("idempotency_key");
CREATE INDEX "job_run_job_started_at_idx" ON "job_run"("job", "started_at");

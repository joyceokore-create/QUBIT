-- M7-B (docs/15 §6.3, docs/16 §12 M7) — GitHub commit automation. Commits that reference
-- a task key link to the task and may move it; deliveries are claimed for replay safety.
-- DDL only — no DM1.18 tenant loop needed.

CREATE TABLE "task_commit_link" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "url" TEXT,
    "message" TEXT NOT NULL,
    "author_name" TEXT,
    "author_user_id" TEXT,
    "committed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_commit_link_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "task_commit_link_task_id_sha_key" ON "task_commit_link"("task_id", "sha");
CREATE INDEX "task_commit_link_tenant_id_task_id_idx" ON "task_commit_link"("tenant_id", "task_id");
ALTER TABLE "task_commit_link" ADD CONSTRAINT "task_commit_link_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_commit_link" ADD CONSTRAINT "task_commit_link_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "project_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_commit_link" ADD CONSTRAINT "task_commit_link_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_delivery_provider_delivery_id_key" ON "webhook_delivery"("provider", "delivery_id");
CREATE INDEX "webhook_delivery_tenant_id_received_at_idx" ON "webhook_delivery"("tenant_id", "received_at");
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_integration" ADD COLUMN "webhook_secret" TEXT;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['task_commit_link', 'webhook_delivery'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I
                      USING (tenant_id = current_setting(''app.tenant_id'', true))
                      WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))', t, t);
  END LOOP;
END $$;

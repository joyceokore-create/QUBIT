-- Plan-approval workflow (§2.2). AI-generated tasks land as 'Draft' (pending approval);
-- everything existing + manual tasks are 'Published'. Additive — existing rows default Published.
ALTER TABLE "project_task" ADD COLUMN "approval_status" TEXT NOT NULL DEFAULT 'Published';
CREATE INDEX "project_task_tenant_id_approval_status_idx" ON "project_task"("tenant_id", "approval_status");

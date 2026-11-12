-- WS2 (UX fidelity Tier 4, mwashukes-desk/plans/ws1-ws2-proposals.md) — decisions waiting on
-- the Group, and the Group-level committee's (GLC) action items.
--  * decision_request: raised by a Head (any project) or a PM (own projects), decided by an
--    Executive (approved / declined) or deferred to a new due date. A decided request writes a
--    "decision" row (the project's Register entry) and keeps the link in decision_id.
--  * glc_action: work someone owes after a decision or a committee meeting (open / done).
-- DDL only. Both tables get the standard tenant RLS policy + FORCE, as every tenant table.

CREATE TABLE "decision_request" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT,
    "title" TEXT NOT NULL,
    "context" TEXT,
    "options" JSONB NOT NULL DEFAULT '[]',
    "raised_by_id" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "outcome" TEXT,
    "outcome_note" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "decision_request_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "decision_request_decision_id_key" ON "decision_request"("decision_id");
CREATE INDEX "decision_request_tenant_id_status_due_date_idx" ON "decision_request"("tenant_id", "status", "due_date");
CREATE INDEX "decision_request_tenant_id_project_id_idx" ON "decision_request"("tenant_id", "project_id");
ALTER TABLE "decision_request" ADD CONSTRAINT "decision_request_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_request" ADD CONSTRAINT "decision_request_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "decision_request" ADD CONSTRAINT "decision_request_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_request" ADD CONSTRAINT "decision_request_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "decision_request" ADD CONSTRAINT "decision_request_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "glc_action" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT,
    "decision_request_id" TEXT,
    "title" TEXT NOT NULL,
    "owner_id" TEXT,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "glc_action_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "glc_action_tenant_id_status_due_date_idx" ON "glc_action"("tenant_id", "status", "due_date");
ALTER TABLE "glc_action" ADD CONSTRAINT "glc_action_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "glc_action" ADD CONSTRAINT "glc_action_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "glc_action" ADD CONSTRAINT "glc_action_decision_request_id_fkey" FOREIGN KEY ("decision_request_id") REFERENCES "decision_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "glc_action" ADD CONSTRAINT "glc_action_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['decision_request', 'glc_action']
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

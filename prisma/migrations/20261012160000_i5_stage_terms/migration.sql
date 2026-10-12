-- docs/38 I5 — stage vocabulary learned from the weekly update workspace's clarifier:
-- the phrases this tenant's PMs use for a stage, each mapped to a gate name. RLS as every
-- other tenant table.
CREATE TABLE "stage_term" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "gate_name" TEXT NOT NULL,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stage_term_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stage_term_tenant_id_term_key" ON "stage_term"("tenant_id", "term");
CREATE INDEX "stage_term_tenant_id_idx" ON "stage_term"("tenant_id");
ALTER TABLE "stage_term" ADD CONSTRAINT "stage_term_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE stage_term ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_term FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_stage_term ON stage_term;
CREATE POLICY tenant_isolation_stage_term ON stage_term
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

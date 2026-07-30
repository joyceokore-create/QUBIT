-- M8-B (docs/16 §6) — the document register: real types, versioning, and a review
-- workflow with NAMED approvers. The status vocabulary changes
-- (PendingReview → InReview, Final → Approved), which is live-data DML on a tenant
-- table under FORCE RLS — so it runs inside the DM1.18 tenant loop. Unscoped it would
-- silently match zero rows in production and leave every document mislabelled.

ALTER TABLE "project_document" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "project_document" ADD COLUMN "supersedes_id" TEXT;
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "project_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- New documents start as drafts; the old default assumed everything arrived final.
ALTER TABLE "project_document" ALTER COLUMN "status" SET DEFAULT 'Draft';

CREATE TABLE "document_approval" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "approver_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'Pending',
    "comment" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_approval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "document_approval_document_id_approver_id_key" ON "document_approval"("document_id", "approver_id");
CREATE INDEX "document_approval_tenant_id_approver_id_idx" ON "document_approval"("tenant_id", "approver_id");
ALTER TABLE "document_approval" ADD CONSTRAINT "document_approval_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_approval" ADD CONSTRAINT "document_approval_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "project_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_approval" ADD CONSTRAINT "document_approval_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE document_approval ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE document_approval FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_document_approval ON document_approval';
  EXECUTE 'CREATE POLICY tenant_isolation_document_approval ON document_approval
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

-- ── DM1.18 tenant loop: remap the status vocabulary on live rows. ────────────────
DO $$
DECLARE
  t record;
  n_review int;
  n_approved int;
BEGIN
  FOR t IN SELECT id, slug FROM tenant LOOP
    PERFORM set_config('app.tenant_id', t.id, true);

    UPDATE project_document SET status = 'InReview' WHERE status = 'PendingReview';
    GET DIAGNOSTICS n_review = ROW_COUNT;
    UPDATE project_document SET status = 'Approved' WHERE status = 'Final';
    GET DIAGNOSTICS n_approved = ROW_COUNT;

    RAISE NOTICE 'tenant %: % → InReview, % → Approved', t.slug, n_review, n_approved;
  END LOOP;
END $$;

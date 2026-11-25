-- Status-report uploads (plan Phase 1): the uploaded file is kept once, server-side, with
-- its parsed rows, so /apply references an upload id instead of trusting base64 sent back by
-- the browser, and projects link to the one copy (project_document.status_upload_id).
-- RLS inline like every tenant table since M4, and listed in prisma/rls.sql.

-- AlterTable
ALTER TABLE "project_document" ADD COLUMN     "status_upload_id" TEXT;

-- CreateTable
CREATE TABLE "status_upload" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "file_name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "file_data" TEXT NOT NULL,
    "iso_week" TEXT NOT NULL,
    "extractor" TEXT NOT NULL DEFAULT 'rules',
    "status" TEXT NOT NULL DEFAULT 'previewed',
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_upload_row" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "upload_id" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "parsed" JSONB NOT NULL,
    "project_id" TEXT,
    "match_confidence" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "applied_check_in_id" TEXT,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_upload_row_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "status_upload_tenant_id_uploaded_by_id_created_at_idx" ON "status_upload"("tenant_id", "uploaded_by_id", "created_at");

-- CreateIndex
CREATE INDEX "status_upload_tenant_id_status_created_at_idx" ON "status_upload"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "status_upload_row_tenant_id_project_id_idx" ON "status_upload_row"("tenant_id", "project_id");

-- CreateIndex
CREATE INDEX "status_upload_row_tenant_id_owner_user_id_state_idx" ON "status_upload_row"("tenant_id", "owner_user_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "status_upload_row_upload_id_line_key" ON "status_upload_row"("upload_id", "line");

-- CreateIndex
CREATE INDEX "project_document_status_upload_id_idx" ON "project_document"("status_upload_id");

-- AddForeignKey
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_status_upload_id_fkey" FOREIGN KEY ("status_upload_id") REFERENCES "status_upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_upload" ADD CONSTRAINT "status_upload_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_upload" ADD CONSTRAINT "status_upload_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_upload_row" ADD CONSTRAINT "status_upload_row_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_upload_row" ADD CONSTRAINT "status_upload_row_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "status_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_upload_row" ADD CONSTRAINT "status_upload_row_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_upload_row" ADD CONSTRAINT "status_upload_row_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['status_upload', 'status_upload_row'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I
                     USING (tenant_id = current_setting(''app.tenant_id'', true))
                     WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))', t, t);
  END LOOP;
END $$;


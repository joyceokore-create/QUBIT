-- Milestone D (exports + email): the tenant's roll-up distribution list, and the
-- "emailed" stamp on an approved weekly roll-up. rollup_recipient is RLS'd inline like
-- every table since M4 and is also listed in prisma/rls.sql.

-- AlterTable
ALTER TABLE "portfolio_report" ADD COLUMN "emailed_at" TIMESTAMP(3),
ADD COLUMN "emailed_to" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "rollup_recipient" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "user_id" TEXT,
    "added_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rollup_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rollup_recipient_tenant_id_idx" ON "rollup_recipient"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "rollup_recipient_tenant_id_email_key" ON "rollup_recipient"("tenant_id", "email");

-- AddForeignKey
ALTER TABLE "rollup_recipient" ADD CONSTRAINT "rollup_recipient_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rollup_recipient" ADD CONSTRAINT "rollup_recipient_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE rollup_recipient ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE rollup_recipient FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_rollup_recipient ON rollup_recipient';
  EXECUTE 'CREATE POLICY tenant_isolation_rollup_recipient ON rollup_recipient
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

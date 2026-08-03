-- M-O3 (docs/22) — single-use, expiring invite / password-reset tokens. Replaces the
-- "admin copies a temp password" flow: the raw token exists only in the emailed link and
-- only its SHA-256 is stored, so a leaked row cannot be replayed.
--
-- DDL only — no DM1.18 tenant loop needed. RLS is applied INLINE here rather than relying
-- on prisma/rls.sql: migrations are what actually run on the box, and rls.sql had drifted
-- (resynced in this same change).

CREATE TABLE "invite_token" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'invite',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invite_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invite_token_token_hash_key" ON "invite_token"("token_hash");
CREATE INDEX "invite_token_tenant_id_user_id_idx" ON "invite_token"("tenant_id", "user_id");
CREATE INDEX "invite_token_user_id_consumed_at_idx" ON "invite_token"("user_id", "consumed_at");

ALTER TABLE "invite_token" ADD CONSTRAINT "invite_token_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invite_token" ADD CONSTRAINT "invite_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE invite_token ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE invite_token FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_invite_token ON invite_token';
  EXECUTE 'CREATE POLICY tenant_isolation_invite_token ON invite_token
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

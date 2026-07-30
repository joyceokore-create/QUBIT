-- M5 (docs/16 §8) — digest-first email. A NotificationPreference row exists only when
-- somebody CHANGED the default, so the default matrix lives in code (one source of
-- truth) rather than being copied into every user's row at signup.
-- Notification.emailed_at makes the digest job idempotent: a notification goes out once.
-- No backfill — existing notifications are simply never emailed retroactively, which is
-- the correct behaviour (nobody wants a digest of last month on the day email turns on).

ALTER TABLE "notification" ADD COLUMN "emailed_at" TIMESTAMP(3);
CREATE INDEX "notification_tenant_id_emailed_at_idx" ON "notification"("tenant_id", "emailed_at");

CREATE TABLE "notification_preference" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'Digest',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_preference_tenant_id_user_id_kind_key" ON "notification_preference"("tenant_id", "user_id", "kind");
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE notification_preference ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE notification_preference FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_notification_preference ON notification_preference';
  EXECUTE 'CREATE POLICY tenant_isolation_notification_preference ON notification_preference
             USING (tenant_id = current_setting(''app.tenant_id'', true))
             WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))';
END $$;

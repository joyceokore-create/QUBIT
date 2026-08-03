-- M-O4 fix-up: the backfill in 20260803150000_mo4_password_set_at ran a plain UPDATE on
-- "user" — a FORCE-RLS table — outside any tenant context, so it matched ZERO rows in
-- every environment (the DM1.18 trap; the "no loop needed" note in that migration was
-- wrong: the loop isn't about per-tenant semantics, it's the only way the migration role
-- can see the rows at all). Re-run it correctly, per tenant. Idempotent: only touches
-- rows still NULL, so users who set a password through the new flow keep their stamp.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM tenant LOOP
    PERFORM set_config('app.tenant_id', t.id, true);
    UPDATE "user"
    SET "password_set_at" = COALESCE("last_login_at", "created_at")
    WHERE "password_hash" IS NOT NULL
      AND "must_change_password" = false
      AND "password_set_at" IS NULL;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END $$;

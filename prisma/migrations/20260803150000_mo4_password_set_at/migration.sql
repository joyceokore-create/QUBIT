-- M-O4 follow-up: `finishOnboarding` originally accepted "a password hash exists" as proof
-- that the invitee had set their own password. That is false for a legacy user holding an
-- ADMIN-ISSUED temp password — they could call /api/onboarding/finish and lift the
-- mustChangePassword gate without ever changing it, reopening the M-O1 bypass through a
-- different door. This column records when the user last set their own password.
--
-- Backfill (additive, no DM1.18 loop needed — this is a whole-table truth, not per-tenant
-- data): users who are NOT gated have, by definition, already been through a password
-- reset or were never temp-issued, so stamp them; gated users stay NULL and must complete
-- the password step.
ALTER TABLE "user" ADD COLUMN "password_set_at" TIMESTAMP(3);

UPDATE "user"
SET "password_set_at" = COALESCE("last_login_at", "created_at")
WHERE "password_hash" IS NOT NULL AND "must_change_password" = false;

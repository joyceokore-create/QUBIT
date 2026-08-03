-- M-O4 (docs/23 §2) — guided first-login: server-bound MFA enrolment, single-use recovery
-- codes, and an honest "finished onboarding" mark.
--
-- Additive columns on the already-RLS-protected `user` table, so no policy work and no
-- DM1.18 tenant loop (nothing is backfilled: existing users simply have no pending
-- enrolment, no recovery codes, and a null onboardedAt until they next go through it).

ALTER TABLE "user"
  ADD COLUMN "pending_mfa_secret" TEXT,
  ADD COLUMN "mfa_recovery_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "onboarded_at" TIMESTAMP(3),
  ADD COLUMN "checklist_dismissed_at" TIMESTAMP(3);

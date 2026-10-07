-- First-week walkthrough (Oct 2026): when the person finished or exited the guided tour.
-- Additive column on the already-RLS-protected `user` table — no policy work, nothing
-- backfilled: existing users simply get the tour offered once, like a new PM.
ALTER TABLE "user" ADD COLUMN "tour_completed_at" TIMESTAMP(3);

-- M-P3a (docs/34) — the PM's "send to the Head of PMs" stamp. Column-only; NULL means
-- confirmed-but-not-sent (or not confirmed at all). Re-confirming resets it: a changed
-- narrative must be re-sent, never silently substituted under the Head.
ALTER TABLE "check_in" ADD COLUMN "submitted_to_head_at" TIMESTAMP(3);

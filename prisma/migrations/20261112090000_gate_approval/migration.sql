-- WS1 (UX fidelity Tier 4) — gate sign-off. Additive only:
--  * checkpoint.requires_approval: NULL = the gate's name decides (Go-Live, SIT exit, UAT
--    exit; src/lib/gate-approval.ts), so no backfill is needed under FORCE RLS;
--  * checkpoint_status.approval (+ who/when/note): separate from `state`, default 'none',
--    so every existing row keeps meaning exactly what it did.
-- RLS: both tables already have ENABLE + FORCE row-level security and the
-- tenant_isolation_<table> policy (20260730160000_mda_checkpoints_markets); new columns are
-- covered by the existing row policy.
ALTER TABLE "checkpoint" ADD COLUMN "requires_approval" BOOLEAN;

ALTER TABLE "checkpoint_status"
  ADD COLUMN "approval" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "submitted_by_id" TEXT,
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "decided_by_id" TEXT,
  ADD COLUMN "decided_at" TIMESTAMP(3),
  ADD COLUMN "decision_note" TEXT;

-- The engine is the only writer; the constraint keeps a typo from ever reaching a row.
ALTER TABLE "checkpoint_status" ADD CONSTRAINT "checkpoint_status_approval_check"
  CHECK ("approval" IN ('none', 'submitted', 'approved', 'approved_with_exception', 'returned'));

CREATE INDEX "checkpoint_status_tenant_id_approval_idx" ON "checkpoint_status"("tenant_id", "approval");

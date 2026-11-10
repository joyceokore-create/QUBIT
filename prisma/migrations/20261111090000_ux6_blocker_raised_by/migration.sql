-- UX6 (UX plan) — "Raise a blocker": record who raised a blocker, separately from its owner
-- (who can unblock it). Additive and nullable: existing rows stay NULL (not backfilled,
-- because the raiser was never stored). The blocker table's existing RLS policy covers it.
ALTER TABLE "blocker" ADD COLUMN "raised_by_id" TEXT;
ALTER TABLE "blocker" ADD CONSTRAINT "blocker_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "blocker_tenant_id_raised_by_id_idx" ON "blocker"("tenant_id", "raised_by_id");

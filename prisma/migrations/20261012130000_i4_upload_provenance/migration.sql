-- docs/38 I4 — provenance on gate and module states moved by a status-report upload:
-- the file's name, when, by whom. Additive; cleared by the next change made by hand.
ALTER TABLE "checkpoint_status" ADD COLUMN "source" TEXT, ADD COLUMN "source_at" TIMESTAMP(3), ADD COLUMN "source_by_id" TEXT;
ALTER TABLE "module_instance_status" ADD COLUMN "source" TEXT, ADD COLUMN "source_at" TIMESTAMP(3), ADD COLUMN "source_by_id" TEXT;

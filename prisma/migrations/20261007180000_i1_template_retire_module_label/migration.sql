-- docs/38 (Joyce, 2026-10-07): only "Product build" stays a gate template — the others are
-- retired (kept on the projects that use them, gone from the picker); and a product names
-- its modules ("Agent channels" for Swipe).

-- AlterTable
ALTER TABLE "checkpoint_template" ADD COLUMN     "retired_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "module_label" TEXT NOT NULL DEFAULT 'Modules';

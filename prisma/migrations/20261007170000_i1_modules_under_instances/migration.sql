-- docs/38 (Joyce, 2026-10-07): a project_module row is either a named INSTANCE of the
-- product or a MODULE (a component such as a Swipe channel) that sits under the product or
-- under one instance; a module tracks its own gates only when own_gates is set.

-- AlterTable
ALTER TABLE "project_module" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'instance',
ADD COLUMN     "own_gates" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parent_id" TEXT;

-- AddForeignKey
ALTER TABLE "project_module" ADD CONSTRAINT "project_module_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "project_module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An instance / module may follow its own gate template (null = the project's).
-- AddForeignKey
ALTER TABLE "project_module" ADD CONSTRAINT "project_module_checkpoint_template_id_fkey" FOREIGN KEY ("checkpoint_template_id") REFERENCES "checkpoint_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

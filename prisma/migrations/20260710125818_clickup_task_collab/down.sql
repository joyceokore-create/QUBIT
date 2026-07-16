-- Reverse of the task-collab migration (manual rollback). Additive → drops only new tables.
DROP TABLE IF EXISTS "comment" CASCADE;
DROP TABLE IF EXISTS "checklist_item" CASCADE;
DROP TABLE IF EXISTS "checklist" CASCADE;

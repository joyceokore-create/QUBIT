-- Reverse of the ClickUp Phase 0 foundation migration (manual rollback — Prisma has
-- no native down migrations). Additive migration, so this drops only the new objects;
-- existing PPM tables are untouched. CASCADE drops the inter-table FK constraints so the
-- statement order doesn't matter; it never reaches PPM tables (nothing new is referenced
-- by them). RLS policies drop automatically with their tables.

DROP TABLE IF EXISTS "activity" CASCADE;
DROP TABLE IF EXISTS "task_watcher" CASCADE;
DROP TABLE IF EXISTS "task_assignee" CASCADE;
DROP TABLE IF EXISTS "task_tag" CASCADE;
DROP TABLE IF EXISTS "task_dependency" CASCADE;
DROP TABLE IF EXISTS "task" CASCADE;
DROP TABLE IF EXISTS "tag" CASCADE;
DROP TABLE IF EXISTS "status" CASCADE;
DROP TABLE IF EXISTS "list" CASCADE;
DROP TABLE IF EXISTS "status_group" CASCADE;
DROP TABLE IF EXISTS "folder" CASCADE;
DROP TABLE IF EXISTS "space" CASCADE;

DROP TYPE IF EXISTS "DependencyType";
DROP TYPE IF EXISTS "Priority";
DROP TYPE IF EXISTS "StatusType";
DROP TYPE IF EXISTS "LocationType";

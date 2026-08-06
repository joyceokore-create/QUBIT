-- M-C (docs/19 §2.2, docs/36 §8) — remove the ClickUp-era schema for good.
--
-- Every table dropped here was verified EMPTY in dev AND production (counted per tenant
-- under set_config('app.tenant_id', …), because these are FORCE-RLS tables where a bare
-- count(*) reads 0 whether or not rows exist — the DM1.18/DM1.50 trap). Nothing in src/
-- or tests/ referenced any of them: the live delivery model is `project_task`, not `task`,
-- and conversation lives in `work_comment`, not `comment`.
--
-- time_entry goes with them: it hung off `task` by a REQUIRED FK, had no capture path left
-- (the timer surface died in the M0 cull) and held 0 rows, so /time could only ever render
-- an empty table. docs/19 M6 owns bringing time capture back against ProjectTask.
--
-- KEPT (live features that merely sat in the same neighbourhood): team, team_member,
-- project_member, project_team, ai_call_log.
--
-- Drop order respects the FKs; CASCADE on the parents covers the join tables either way.
DROP TABLE IF EXISTS "time_entry" CASCADE;
DROP TABLE IF EXISTS "automation_run" CASCADE;
DROP TABLE IF EXISTS "automation" CASCADE;
DROP TABLE IF EXISTS "view" CASCADE;
DROP TABLE IF EXISTS "field_value" CASCADE;
DROP TABLE IF EXISTS "field_definition" CASCADE;
DROP TABLE IF EXISTS "comment" CASCADE;
DROP TABLE IF EXISTS "checklist_item" CASCADE;
DROP TABLE IF EXISTS "checklist" CASCADE;
DROP TABLE IF EXISTS "activity" CASCADE;
DROP TABLE IF EXISTS "task_watcher" CASCADE;
DROP TABLE IF EXISTS "task_assignee" CASCADE;
DROP TABLE IF EXISTS "task_tag" CASCADE;
DROP TABLE IF EXISTS "tag" CASCADE;
DROP TABLE IF EXISTS "task_dependency" CASCADE;
DROP TABLE IF EXISTS "task" CASCADE;
DROP TABLE IF EXISTS "status" CASCADE;
DROP TABLE IF EXISTS "status_group" CASCADE;
DROP TABLE IF EXISTS "list" CASCADE;
DROP TABLE IF EXISTS "folder" CASCADE;
DROP TABLE IF EXISTS "space" CASCADE;

-- The enum types existed only for the tables above.
DROP TYPE IF EXISTS "RunStatus";
DROP TYPE IF EXISTS "ViewType";
DROP TYPE IF EXISTS "FieldType";
DROP TYPE IF EXISTS "DependencyType";

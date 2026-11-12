-- UX9 (UX plan D10) — the "testing" tag on gate template checkpoints. Head of QA may set only
-- testing gates. Nullable and NOT backfilled: while it is NULL the checkpoint's name decides
-- (SIT / UAT / testing → testing gate; src/lib/testing-gates.ts), which is the same in every
-- tenant and needs no data migration under FORCE RLS. The table's RLS policy covers it.
ALTER TABLE "checkpoint" ADD COLUMN "testing" BOOLEAN;

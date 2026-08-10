-- DM1.72 — the org-setup wizard is retired. QUBIT serves ONE tenant (Riverbank) whose
-- brand, markets, departments and checkpoint templates are settled and coded, so a
-- first-run wizard for configuring them had nothing left to configure.
--
-- `setup_completed_at` existed only to decide whether to show the "finish setting up"
-- banner. The banner is gone, so the column is dead weight rather than a fact anyone
-- reads. Dropping a timestamp column loses no delivery data.
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "setup_completed_at";

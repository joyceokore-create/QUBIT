-- UX2 (UX plan Q3, U5, D11).
-- 1. Each tenant's time zone: "today", "overdue", due dates and the Daily Brief read it,
--    never the server's or the browser's clock. Riverbank and every existing tenant start
--    on Africa/Nairobi (EAT, UTC+3); Super Admin can change it (Admin › Settings, UX11).
ALTER TABLE "tenant" ADD COLUMN "time_zone" TEXT NOT NULL DEFAULT 'Africa/Nairobi';

-- 2. Per-user layout choice for the staged rollout of the new home pages: 'new' | 'classic';
--    NULL follows the FEATURE_NEW_UI default. Set from the profile menu (audited).
--    No new table, so no new RLS policy: the user table's existing policy applies.
ALTER TABLE "user" ADD COLUMN "ui_mode" TEXT;

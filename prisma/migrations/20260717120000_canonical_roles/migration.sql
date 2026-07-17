-- Canonical roles (PROMPT §1, DECISIONS DM1.2). Remaps existing role_assignment grants from
-- the legacy role set to the six canonical tenant roles. No schema change — data only.
--
-- RLS NOTE: role_assignment has FORCE ROW LEVEL SECURITY and `migrate deploy` runs as the
-- app DB role (non-superuser) with no `app.tenant_id` set, so a bare UPDATE would match ZERO
-- rows. We disable RLS on the table for the duration of the remap (permitted for the table
-- owner), then restore ENABLE + FORCE. Runs inside the migration transaction.
--
-- SECURITY-CRITICAL ORDERING: the legacy `PlatformSuperAdmin` was a CROSS-TENANT, READ-ONLY
-- oversight role (docs/07). We are REPURPOSING that name to mean the full-write superadmin.
-- So we MUST demote the old PlatformSuperAdmin grants to Executive FIRST, and only THEN
-- promote SystemAdmin → PlatformSuperAdmin — otherwise today's read-only oversight accounts
-- would be silently elevated to full write.

ALTER TABLE "role_assignment" DISABLE ROW LEVEL SECURITY;

-- 1. Old read-only oversight → Executive (BEFORE the promotion below).
UPDATE "role_assignment" SET "role" = 'Executive'          WHERE "role" = 'PlatformSuperAdmin';
-- 2. Tenant super-admin → the repurposed PlatformSuperAdmin.
UPDATE "role_assignment" SET "role" = 'PlatformSuperAdmin'  WHERE "role" = 'SystemAdmin';
-- 3. Remaining legacy roles → canonical.
UPDATE "role_assignment" SET "role" = 'HeadOfProjects'      WHERE "role" = 'PortfolioManager';
UPDATE "role_assignment" SET "role" = 'Executive'           WHERE "role" = 'FinanceManager';
UPDATE "role_assignment" SET "role" = 'Member'              WHERE "role" = 'Contributor';
UPDATE "role_assignment" SET "role" = 'Member'              WHERE "role" = 'Viewer';
-- DepartmentHead was an approval-only marker; department-head powers now derive from
-- Department.headUserId (+ a Head role), so the RBAC grant collapses to Member.
UPDATE "role_assignment" SET "role" = 'Member'              WHERE "role" = 'DepartmentHead';

-- De-duplicate grants that collapsed onto the same role (e.g. a user who held both
-- Contributor and Viewer now has two 'Member' rows; someone with SystemAdmin +
-- PlatformSuperAdmin now has Executive + PlatformSuperAdmin — distinct, kept).
DELETE FROM "role_assignment" a
  USING "role_assignment" b
  WHERE a.ctid < b.ctid
    AND a."tenant_id" = b."tenant_id"
    AND a."user_id" = b."user_id"
    AND a."role" = b."role"
    AND a."scope_type" IS NOT DISTINCT FROM b."scope_type"
    AND a."scope_id" IS NOT DISTINCT FROM b."scope_id";

ALTER TABLE "role_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_assignment" FORCE ROW LEVEL SECURITY;

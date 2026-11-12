-- UX fidelity Tier 1 (plan D-F3): what the requester asks for, from the public form.
-- access_request is a system table (no tenant, no RLS) — requests arrive before a tenant
-- exists. Both columns are optional; existing requests read "Not given". No department or
-- team is collected publicly (the admin assigns them when granting).
ALTER TABLE "access_request" ADD COLUMN "requested_role" TEXT;
ALTER TABLE "access_request" ADD COLUMN "reason" VARCHAR(300);

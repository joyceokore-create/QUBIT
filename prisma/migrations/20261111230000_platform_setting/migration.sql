-- UX fidelity D-F3b: platform-wide settings (access-request retention first).
-- System table like access_request: no tenant_id, no RLS. Writes are PlatformSuperAdmin
-- only (enforced in src/server/platform-settings.ts) and audited in the actor's tenant.
CREATE TABLE "platform_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_setting_pkey" PRIMARY KEY ("key")
);

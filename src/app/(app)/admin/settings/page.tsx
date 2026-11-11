import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Forbidden } from "@/components/forbidden";
import { getTenantTimeZone } from "@/server/preferences";
import { AdminHeader } from "../admin-header";
import { TimeZoneForm } from "./time-zone-form";
import { RetentionForm } from "./retention-form";
import { getAccessRequestRetentionDays } from "@/server/platform-settings";

// UX11 (UX plan Q3) — Admin › Settings: the tenant's time zone, which every "today",
// "overdue", due date, Brief and the Friday 17:00 deadline use; and (UX fidelity D-F3b) how
// long decided access requests are kept. Super Admin only.
export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "iam:manage")) return <Forbidden />;
  const [timeZone, retention] = await Promise.all([getTenantTimeZone(ctx), getAccessRequestRetentionDays()]);
  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-[22px_24px_90px]">
      <AdminHeader title="Settings" description={`Settings for ${session.user.tenantName}. Changes are audited.`} />
      <TimeZoneForm current={timeZone} />
      <RetentionForm current={retention} canEdit={ctx.roles.includes("PlatformSuperAdmin")} />
    </main>
  );
}

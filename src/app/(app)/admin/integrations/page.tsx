import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { flagEnabled } from "@/lib/flags";
import { Forbidden } from "@/components/forbidden";
import { listYoutrackConnections } from "@/server/youtrack-bulk";
import { AdminHeader } from "../admin-header";
import { YoutrackBulkPanel } from "./youtrack-bulk-panel";

// Admin › Integrations — connect YouTrack for every project from one screen (the
// per-project card under Team › Integrations keeps working; both write the same rows).
// Gate: project:update (Heads / admins), the same key the per-project connect uses.
export default async function AdminIntegrationsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "project:update")) return <Forbidden />;

  const rows = await listYoutrackConnections(ctx);
  const connected = rows.filter((r) => r.connected).length;

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader canManageIam={can(ctx, "iam:manage")} subtitle={`YouTrack · ${connected} of ${rows.length} active ${rows.length === 1 ? "project" : "projects"} connected`} />
      <YoutrackBulkPanel
        enabled={flagEnabled("youtrack")}
        initialRows={rows.map((r) => ({ ...r, lastSyncAt: r.lastSyncAt?.toISOString() ?? null }))}
      />
    </main>
  );
}

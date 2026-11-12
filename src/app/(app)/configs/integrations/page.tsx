import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Forbidden } from "@/components/forbidden";
import { listYoutrackMappings } from "@/server/integrations/youtrack";
import { ConfigsHeader } from "../configs-header";
import { YoutrackPanel, type MappingViewJson } from "./youtrack-panel";

// Configs › Integrations — the tenant-level YouTrack integration: one instance + one token,
// projects mapped by picking from what the token can read. Gate: integrations:manage
// (Heads / admins). The server renders the full view once; the panel refetches after writes.
export default async function ConfigsIntegrationsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "integrations:manage")) return <Forbidden />;

  const view = await listYoutrackMappings(ctx);
  const initial: MappingViewJson = {
    ...view,
    status: { ...view.status, lastCheckedAt: view.status.lastCheckedAt?.toISOString() ?? null },
  };
  const subtitle = view.status.connected
    ? `YouTrack · ${view.counts.ready} of ${view.counts.all} active ${view.counts.all === 1 ? "project" : "projects"} ready · signed in as ${view.status.connectedUser ?? "—"}`
    : "YouTrack · not connected — one instance and one read-only token for the whole tenant";

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <ConfigsHeader subtitle={subtitle} />
      <YoutrackPanel initial={initial} />
    </main>
  );
}

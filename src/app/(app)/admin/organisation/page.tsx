import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Forbidden } from "@/components/forbidden";
import { listOrgUnits } from "@/server/org-units";
import { AdminHeader } from "../admin-header";
import { OrgUnitsPanel } from "./org-units-panel";

// docs/38 — Admin › Markets: the markets (= subsidiaries) a product ships into, which
// projects pick on their Markets tab. Until I1 these lived only in the seed.
export default async function AdminOrganisationPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "admin:access")) return <Forbidden />;

  const units = await listOrgUnits(ctx);
  const markets = units.filter((u) => u.kind === "Market").length;

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <AdminHeader canManageIam={can(ctx, "iam:manage")} subtitle={`Markets · ${units.length} ${units.length === 1 ? "market" : "markets"}${markets !== units.length ? ` (${units.length - markets} internal)` : ""}`} />
      <OrgUnitsPanel initial={units.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))} />
    </main>
  );
}

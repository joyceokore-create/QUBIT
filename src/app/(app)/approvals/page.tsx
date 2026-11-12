import { auth } from "@/lib/auth";
import { withTenant } from "@/lib/tenant";
import { canApproveIdeas, canOpenApprovals, getApprovals } from "@/server/approvals";
import { getTenantTimeZone } from "@/server/preferences";
import { Forbidden } from "@/components/forbidden";
import { ApprovalsClient } from "./approvals-client";

// UX8 — Approvals v1 (UX plan D5): ideas waiting for triage and open staffing requests, in
// one list, oldest first. Only what this person can act on is listed (src/server/approvals.ts);
// the weekly roll-up is approved in Reports, so it is a banner with a link, not a row. Every
// decision goes through the existing, audited routes (/api/ideas/[id]/triage,
// /api/staffing/requests/[id]); accepting an idea happens in the project wizard, as today.
export default async function ApprovalsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!canOpenApprovals(ctx)) return <Forbidden />;

  const now = new Date();
  const [feed, projects, timeZone] = await Promise.all([
    getApprovals(ctx, now),
    // Merge targets for the Triage drawer — only needed by someone who may triage.
    canApproveIdeas(ctx)
      ? withTenant(ctx, (tx) =>
          tx.project.findMany({
            where: { status: { notIn: ["Completed", "Cancelled"] } },
            select: { id: true, code: true, name: true },
            orderBy: { name: "asc" },
          }),
        )
      : Promise.resolve([]),
    getTenantTimeZone(ctx),
  ]);

  return <ApprovalsClient feed={feed} projects={projects} tenantName={session.user.tenantName} timeZone={timeZone} nowIso={now.toISOString()} />;
}

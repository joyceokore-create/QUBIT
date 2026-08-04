import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, primaryRoleLabel } from "@/lib/rbac";
import { Topbar } from "@/components/layout/topbar";
import { RiverbankShell } from "@/components/layout/riverbank-shell";
import { TenantScope } from "@/components/layout/tenant-scope";
import { prisma } from "@/lib/db";
import { SlidePanelStateProvider } from "@/components/panels/panel-context";
import { SlidePanel } from "@/components/panels/slide-panel";
import { QProvider } from "@/components/q/q-provider";
import { QDrawer } from "@/components/q/q-drawer";
import { AmbientField } from "@/components/layout/ambient-field";

type BrandStyle = CSSProperties & { "--brand"?: string };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  // Invited users must set their own password first. /onboarding lives outside this
  // layout group, so redirecting here can't loop.
  if (session.user.mustChangePassword) {
    redirect("/onboarding");
  }

  // Point --brand at the tenant's theme-aware brand var (defined per theme in
  // globals.css) rather than a fixed hex, so the brand flips correctly on the
  // ☼/☾ toggle. Riverbank = red, everything else = the QUBIT product green.
  // --brand-light is derived from --brand via color-mix in globals.css.
  const brandStyle: BrandStyle = {
    "--brand": session.user.tenantSlug === "riverbank" ? "var(--rbrand)" : "var(--pbrand)",
  };
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  const canReports = can(ctx, "reports:read");

  // Riverbank uses a collapsible left-sidebar shell; every other tenant keeps the
  // top-navigation bar. Resolve the shell's data once (mirrors what Topbar queries).
  const isRiverbank = session.user.tenantSlug === "riverbank";
  const canAccessAdmin = can(ctx, "admin:access");
  const canStaff = can(ctx, "project:create") || can(ctx, "staffing:manage");
  const canSwitchTenant = can(ctx, "tenant:switch");
  const tenants = isRiverbank && canSwitchTenant
    ? await prisma.tenant.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } })
    : [];

  return (
    <div data-tenant={session.user.tenantSlug} style={brandStyle} className="app-shell relative isolate min-h-screen bg-background">
      <TenantScope slug={session.user.tenantSlug} />
      <AmbientField />
      <QProvider userId={session.user.id} roles={session.user.roles}>
        <SlidePanelStateProvider>
          {isRiverbank ? (
            <div className="relative z-[1]">
              <RiverbankShell
                canAccessAdmin={canAccessAdmin}
                canStaff={canStaff}
                canSwitchTenant={canSwitchTenant}
                tenants={tenants}
                tenantSlug={session.user.tenantSlug}
                tenantName={session.user.tenantName ?? ""}
                userName={session.user.name ?? ""}
                userEmail={session.user.email ?? ""}
                userRole={primaryRoleLabel(session.user.roles)}
              >
                {children}
              </RiverbankShell>
            </div>
          ) : (
            <div className="relative z-[1]">
              <Topbar />
              <main className="flex min-h-[calc(100vh-62px)] flex-col">{children}</main>
            </div>
          )}
          <SlidePanel />
          <QDrawer canReports={canReports} />
        </SlidePanelStateProvider>
      </QProvider>
    </div>
  );
}

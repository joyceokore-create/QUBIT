import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, primaryRoleLabel } from "@/lib/rbac";
import { Topbar } from "@/components/layout/topbar";
import { RiverbankShell } from "@/components/layout/riverbank-shell";
import { isMemberOnly } from "@/components/layout/nav-items";
import { TenantScope } from "@/components/layout/tenant-scope";
import { prisma } from "@/lib/db";
import { SlidePanelStateProvider } from "@/components/panels/panel-context";
import { SlidePanel } from "@/components/panels/slide-panel";
import { QProvider } from "@/components/q/q-provider";
import { QDrawer } from "@/components/q/q-drawer";
import { AmbientField } from "@/components/layout/ambient-field";
import { ssoEnabled } from "@/lib/sso";
import { TourProvider } from "@/components/tour/tour-provider";
import { shouldOfferTour } from "@/server/tour";
import { getViewState } from "@/server/preferences";
import { menuFor } from "@/lib/role-menus";
import { SUPER_ADMIN } from "@/lib/view-roles";

type BrandStyle = CSSProperties & { "--brand"?: string };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  // Non-SSO: invited users set their own password first (/onboarding lives outside this
  // layout group, so redirecting here can't loop). Under Entra SSO, Entra owns password
  // and MFA — the password onboarding is skipped, so a Microsoft sign-in lands straight in.
  if (session.user.mustChangePassword && !ssoEnabled()) {
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
  const memberOnly = isMemberOnly(session.user.personas ?? []);

  // Module registry (global, no RLS) → nav gating by each module's allowedRoles.
  const moduleRows = isRiverbank
    ? await prisma.appModule.findMany({ where: { status: "Active" }, select: { code: true, allowedRoles: true } })
    : [];
  const moduleAllowedRoles = Object.fromEntries(moduleRows.map((m) => [m.code, m.allowedRoles]));
  // First-week walkthrough: offered once to people who run projects (or hold the PM role).
  const tour = await shouldOfferTour(ctx);

  // UX3 (D2a/D6/D11): with the new layout on, the sidebar is the "Viewing as" role's menu,
  // filtered by the person's REAL permissions (roles pick the layout, permissions hide items).
  const view = isRiverbank ? await getViewState(ctx) : null;
  const newNav =
    view?.uiMode === "new"
      ? {
          groups: menuFor(view.viewRole, { can: (perm) => can(ctx, perm), roles: ctx.roles, moduleAllowedRoles }),
          viewRole: view.viewRole,
          options: view.options,
          showSwitch: view.showSwitch,
          superAdmin: ctx.roles.includes(SUPER_ADMIN),
          // UX fidelity F1: the top bar's "+ New" offers only what this person may create.
          create: [
            ...(can(ctx, "project:create") ? [{ key: "project", label: "Project", hint: "Start the project wizard", href: "/projects/new" }] : []),
            ...(can(ctx, "idea:create") ? [{ key: "idea", label: "Idea", hint: "Submit an idea for triage", href: "/ideas?new=1" }] : []),
            ...(can(ctx, "risk:create") ? [{ key: "risk", label: "Risk", hint: "Add a risk to the register", href: "/risks?new=1" }] : []),
          ],
        }
      : undefined;

  return (
    <div data-tenant={session.user.tenantSlug} style={brandStyle} className="app-shell relative isolate min-h-screen bg-background">
      <TenantScope slug={session.user.tenantSlug} />
      <AmbientField />
      <QProvider userId={session.user.id} roles={session.user.roles}>
        <TourProvider offer={tour.offer} eligible={tour.eligible} firstProjectId={tour.firstProjectId} reportsQuery={tour.reportsQuery} dashboardQuery={tour.dashboardQuery} appDone={tour.appDone} projects={tour.projects}>
        <SlidePanelStateProvider>
          {isRiverbank ? (
            <div className="relative z-[1]">
              <RiverbankShell
                canAccessAdmin={canAccessAdmin}
                canStaff={canStaff}
                memberOnly={memberOnly}
                roles={session.user.roles}
                moduleAllowedRoles={moduleAllowedRoles}
                tenantName={session.user.tenantName ?? ""}
                userName={session.user.name ?? ""}
                userEmail={session.user.email ?? ""}
                userRole={primaryRoleLabel(session.user.roles)}
                uiMode={view?.uiMode}
                newNav={newNav}
              >
                {children}
              </RiverbankShell>
            </div>
          ) : (
            <div className="relative z-[1]">
              <Topbar />
              <main className="flex min-h-[calc(100vh-62px)] flex-col">
                {children}
              </main>
            </div>
          )}
          <SlidePanel />
          <QDrawer canReports={canReports} />
        </SlidePanelStateProvider>
        </TourProvider>
      </QProvider>
    </div>
  );
}


import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Topbar } from "@/components/layout/topbar";
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
  // ☼/☾ toggle. Riverbank = red, everything else = the product green (KCB).
  // --brand-light is derived from --brand via color-mix in globals.css.
  const brandStyle: BrandStyle = {
    "--brand": session.user.tenantSlug === "riverbank" ? "var(--rbrand)" : "var(--pbrand)",
  };
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  const canReports = can(ctx, "reports:read");

  return (
    <div style={brandStyle} className="app-shell relative isolate min-h-screen bg-background">
      <AmbientField />
      <QProvider userId={session.user.id}>
        <SlidePanelStateProvider>
          <div className="relative z-[1]">
            <Topbar />
            <main className="flex min-h-[calc(100vh-62px)] flex-col">{children}</main>
          </div>
          <SlidePanel />
          <QDrawer canReports={canReports} />
        </SlidePanelStateProvider>
      </QProvider>
    </div>
  );
}

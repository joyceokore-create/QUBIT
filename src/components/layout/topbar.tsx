import Link from "next/link";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { QubitLogo } from "@/components/brand/qubit-logo";
import { NavPills } from "@/components/layout/nav-pills";
import { isMemberOnly } from "@/components/layout/nav-items";
import { TenantChip } from "@/components/layout/tenant-chip";
import { UserMenu } from "@/components/layout/user-menu";
import { AskQButton } from "@/components/layout/ask-q-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NotificationBell } from "@/components/layout/notification-bell";

// Sticky 62px app-shell topbar (design_handoff screen 1). Replaces the sidebar
// for the reimagined screens: brand logo, nav pills, theme toggle, tenant
// switcher (gated on tenant:switch), Ask Q, and the avatar/sign-out menu.
export async function Topbar() {
  const session = await auth();
  if (!session?.user) return null;

  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };

  const canAccessAdmin = can(ctx, "admin:access");
  const canStaff = can(ctx, "project:create") || can(ctx, "staffing:manage");
  const memberOnly = isMemberOnly(session.user.personas ?? []);
  const canSwitchTenant = can(ctx, "tenant:switch");

  // Tenant list only needed (and only queried) for the switcher. The tenant
  // table has no RLS and names aren't sensitive (they appear on the landing page).
  const tenants = canSwitchTenant
    ? (await prisma.tenant.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }))
    : [];

  return (
    <header
      className="sticky top-0 z-40 flex h-[62px] items-center gap-[22px] border-b border-[var(--tbbd)] px-6 backdrop-blur-[16px] backdrop-saturate-[1.2]"
      style={{ background: "var(--topbar)" }}
    >
      {/* Periodic sheen sweeping across the gradient (both themes). */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span
          className="absolute inset-y-0 -left-1/3 w-1/3 [animation:topbarSheen_7s_ease-in-out_infinite]"
          style={{ background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.14), transparent)" }}
        />
      </span>

      <Link href="/dashboard" className="relative flex items-center gap-[11px]">
        <QubitLogo square={9} gap={2.5} radius={2.5} color="var(--tbglyph)" />
        <span className="font-heading text-[16.5px] font-bold tracking-[2.5px] text-[var(--tbinkS)]">QUBIT</span>
      </Link>

      <NavPills canAccessAdmin={canAccessAdmin} canStaff={canStaff} memberOnly={memberOnly} />

      <NotificationBell />
      <ThemeToggle />
      <TenantChip
        currentSlug={session.user.tenantSlug}
        currentName={session.user.tenantName}
        canSwitch={canSwitchTenant}
        tenants={tenants}
      />
      <AskQButton />
      <UserMenu name={session.user.name ?? ""} email={session.user.email ?? ""} />
    </header>
  );
}

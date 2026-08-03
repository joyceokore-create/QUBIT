import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withTenant } from "@/lib/tenant";
import { primaryRoleLabel } from "@/lib/rbac";
import { mfaRequired } from "@/lib/mfa-policy";
import { isUserGroup, landingPersona } from "@/lib/personas";
import { GROUP_LABELS } from "@/components/admin/labels";
import { TenantScope } from "@/components/layout/tenant-scope";
import { OnboardingForm } from "./onboarding-form";

// First-login acceptance screen. Reachable only when signed in; the middleware sends
// invited users here until they set their own password.
export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const brand = session.user.tenantSlug === "riverbank" ? "var(--rbrand)" : "var(--pbrand)";

  // Read the facts the flow branches on from the DATABASE, not the session token.
  // `needsPassword` keys off passwordSetAt, NOT passwordHash: a legacy user holding an
  // ADMIN-ISSUED temp password has a hash but has not chosen one, and must still do the
  // password step — otherwise they'd be shown MFA first and could never satisfy finish.
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const me = await withTenant(ctx, (tx) =>
    tx.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { passwordHash: true, passwordSetAt: true, mfaSecret: true, primaryGroup: true, roles: { select: { role: true } } },
    }),
  );
  const roles = me.roles.map((r) => r.role);
  const viewer = {
    firstName: session.user.name?.split(/\s+/)[0] ?? "there",
    roleLabel: primaryRoleLabel(roles),
    personaLabel:
      GROUP_LABELS[
        landingPersona(
          (session.user.personas ?? []).filter(isUserGroup),
          isUserGroup(me.primaryGroup) ? me.primaryGroup : null,
          null,
        )
      ],
    mfaRequired: mfaRequired(roles),
    mfaEnrolled: Boolean(me.mfaSecret),
  };

  return (
    <div
      // TenantScope mirrors data-tenant onto <html> so token-derived colours (bg-primary
      // → --primary → --brand) resolve to the tenant brand here too — the inline --brand
      // below only reaches components that read var(--brand) directly.
      data-tenant={session.user.tenantSlug}
      className="app-shell flex min-h-screen items-center justify-center px-5 py-10"
      style={{
        ["--brand" as string]: brand,
        backgroundColor: "var(--qbg)",
        backgroundImage:
          "radial-gradient(1200px 520px at 72% -160px, color-mix(in oklab, var(--brand) 13%, transparent), transparent 62%), radial-gradient(var(--w06) 1px, transparent 1.5px)",
        backgroundSize: "auto, 26px 26px",
      }}
    >
      <TenantScope slug={session.user.tenantSlug} />
      <div className="w-full max-w-[420px] rounded-[18px] border border-[var(--w08)] bg-[var(--qcard)] p-7">
        <h1 className="text-[20px] font-bold text-[var(--qink)]">Welcome to QUBIT</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink3)]">
          Hi {viewer.firstName} — a few quick steps and you&apos;re in.
        </p>
        <OnboardingForm viewer={viewer} needsPassword={!me.passwordSetAt} />
      </div>
    </div>
  );
}

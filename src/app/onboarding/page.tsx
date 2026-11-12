import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withTenant } from "@/lib/tenant";
import { primaryRoleLabel } from "@/lib/rbac";
import { mfaRequired } from "@/lib/mfa-policy";
import { isUserGroup, landingPersona } from "@/lib/personas";
import { GROUP_LABELS } from "@/components/admin/labels";
import { TenantScope } from "@/components/layout/tenant-scope";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
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
    // TenantScope mirrors data-tenant onto <html> so token-derived colours resolve to the
    // tenant brand here too (bg-primary → --primary → --brand), and the --qcard surface the
    // two-panel shell sits on picks up the tenant's palette.
    <div data-tenant={session.user.tenantSlug} style={{ ["--brand" as string]: brand }}>
      <TenantScope slug={session.user.tenantSlug} />
      <AuthShell
        brand={brand}
        art="setup"
        heading="Let’s get you set up"
        sentence={
          viewer.mfaRequired && !viewer.mfaEnrolled
            ? "Set a password and connect your authenticator. It takes about two minutes."
            : "A few quick steps and you’re in. It takes about two minutes."
        }
        footer={session.user.tenantName}
      >
        <AuthHeading title="Set Up Your Account" lead={<>Hi {viewer.firstName}. Two quick steps and you&apos;re in.</>} />
        <OnboardingForm viewer={viewer} needsPassword={!me.passwordSetAt} />
      </AuthShell>
    </div>
  );
}

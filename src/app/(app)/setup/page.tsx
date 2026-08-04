import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getSetupState } from "@/server/org-setup";
import { Forbidden } from "@/components/forbidden";
import { SetupWizard } from "./setup-wizard";

// M-P1e (docs/31 §5) — the one-time, resumable org-setup wizard. Super Admin only.
export default async function SetupPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  if (!can(ctx, "iam:manage")) return <Forbidden />;

  const state = await getSetupState(ctx);

  return (
    <div className="mx-auto w-full max-w-[860px] px-6 py-6">
      <h1 className="text-[20px] font-bold tracking-[-0.4px] text-[var(--qink)]">Set up QUBIT</h1>
      <p className="mb-5 text-[12.5px] text-[var(--ink3)]">
        A tenant usable in ten minutes — every step skippable, every step resumable.
      </p>
      <SetupWizard
        userId={ctx.userId}
        state={{
          done: state.setupCompletedAt !== null,
          brandColor: state.brandColor,
          markets: state.markets,
          departments: state.departments,
          templates: state.templates,
          invitedPeople: state.invitedPeople,
          portfolios: state.portfolios,
        }}
      />
    </div>
  );
}

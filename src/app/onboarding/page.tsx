import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

// First-login acceptance screen. Reachable only when signed in; the middleware sends
// invited users here until they set their own password.
export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const brand = session.user.tenantSlug === "riverbank" ? "var(--rbrand)" : "var(--pbrand)";

  return (
    <div
      className="app-shell flex min-h-screen items-center justify-center px-5 py-10"
      style={{
        ["--brand" as string]: brand,
        backgroundColor: "var(--qbg)",
        backgroundImage:
          "radial-gradient(1200px 520px at 72% -160px, color-mix(in oklab, var(--brand) 13%, transparent), transparent 62%), radial-gradient(var(--w06) 1px, transparent 1.5px)",
        backgroundSize: "auto, 26px 26px",
      }}
    >
      <div className="w-full max-w-[420px] rounded-[18px] border border-[var(--w08)] bg-[var(--qcard)] p-7">
        <h1 className="text-[20px] font-bold text-[var(--qink)]">Welcome to QUBIT</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink3)]">
          Hi {session.user.name?.split(/\s+/)[0] ?? "there"} — set your own password to finish setting up your account.
        </p>
        <OnboardingForm />
        <p className="mt-4 text-[11.5px] text-[var(--ink5)]">
          Tip: after this, enable two-factor authentication under Settings → Security for extra protection.
        </p>
      </div>
    </div>
  );
}

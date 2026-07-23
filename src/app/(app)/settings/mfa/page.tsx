import { Lock, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { MfaEnrollForm } from "./mfa-enroll-form";

const benefits = [
  {
    icon: Lock,
    title: "Protects against stolen passwords",
    body: "A leaked password alone won't be enough to sign in.",
  },
  {
    icon: Smartphone,
    title: "Codes stay on your device",
    body: "Your authenticator app generates them — even offline.",
  },
  {
    icon: RefreshCw,
    title: "A fresh code every 30 seconds",
    body: "Time-based codes can't be reused or shared.",
  },
];

export default function MfaSettingsPage() {
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center p-4 sm:p-6">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-[var(--w07)] bg-[var(--qcard)] shadow-[var(--cardsh)] lg:grid-cols-2">
        {/* ── Left: identity + why it matters ─────────────────────────────── */}
        <aside className="relative flex flex-col gap-7 border-b border-[var(--w07)] bg-[color-mix(in_oklab,var(--brand)_6%,var(--card2))] p-7 sm:p-9 lg:border-b-0 lg:border-r">
          {/* soft brand glow, purely atmospheric */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -left-16 size-60 rounded-full bg-[var(--amb1)] blur-3xl"
          />
          <div className="relative flex flex-col gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--brand)_16%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--brand)_22%,transparent)]">
              <ShieldCheck className="size-6 text-[var(--brand)]" aria-hidden />
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="text-[22px] font-bold tracking-[-.4px] text-balance text-foreground rv:text-heading-md">
                Two-factor authentication
              </h1>
              <p className="max-w-[38ch] text-sm leading-[1.6] text-ink-3">
                Add an authenticator app for an extra layer of security on your account.
              </p>
            </div>
          </div>

          <ul className="relative flex flex-col gap-4">
            {benefits.map((b) => (
              <li key={b.title} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-8 flex-none place-items-center rounded-xl bg-[var(--qcard)] text-[var(--brand)] ring-1 ring-[var(--w07)]">
                  <b.icon className="size-4" aria-hidden />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13.5px] font-semibold leading-[1.4] text-foreground">
                    {b.title}
                  </span>
                  <span className="text-[12.5px] leading-[1.5] text-ink-3">{b.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        {/* ── Right: the setup flow ───────────────────────────────────────── */}
        <div className="flex flex-col justify-center p-7 sm:p-9">
          <MfaEnrollForm />
        </div>
      </div>
    </div>
  );
}

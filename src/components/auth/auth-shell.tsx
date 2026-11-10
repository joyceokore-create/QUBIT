"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Two-panel pre-auth canvas (UX plan D8c) shared by sign-in, request access and first
 * sign-in setup. Left: a 3D illustration with a short heading and one sentence. Right: the
 * QUBIT logo, the form in a shadowed card, and a footer. Both panels sit on the card
 * surface and follow light/dark; there is no divider between them. Below `lg` the
 * illustration panel is dropped so the form owns the screen.
 *
 * `brand` sets --login-brand for the form's buttons and focus rings: the resolved tenant's
 * brand once known, the product green before that.
 */
export type AuthArt = "hero" | "mfa" | "setup";

const ART: Record<AuthArt, { src: string; width: number; height: number }> = {
  hero: { src: "/login/hero.png", width: 720, height: 900 },
  mfa: { src: "/login/mfa.png", width: 900, height: 900 },
  setup: { src: "/login/setup.png", width: 900, height: 900 },
};

export interface AuthShellProps {
  brand: string;
  art: AuthArt;
  heading: string;
  sentence: string;
  /** Left of the footer, e.g. the resolved organisation's name. */
  footer?: ReactNode;
  children: ReactNode;
}

export function AuthShell({ brand, art, heading, sentence, footer, children }: AuthShellProps) {
  const img = ART[art];
  return (
    <div
      className="login-shell grid min-h-screen w-full bg-[var(--l-bg)] font-sans lg:grid-cols-2"
      style={{ "--login-brand": brand } as CSSProperties}
    >
      <aside className="hidden flex-col items-center justify-center gap-6 px-14 py-10 text-center lg:flex" aria-hidden="true">
        <div className={cn("relative grid w-full max-w-[380px] place-items-center", art === "mfa" && "auth-art-circle")}>
          <Image
            key={img.src}
            src={img.src}
            alt=""
            width={img.width}
            height={img.height}
            priority
            className="relative h-auto w-full [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]"
          />
        </div>
        <div>
          <p className="text-[26px] font-extrabold tracking-[-.01em] text-[var(--l-ink)]">{heading}</p>
          <p className="mx-auto mt-2 max-w-[38ch] text-[15px] leading-[1.55] text-[var(--l-ink-2)]">{sentence}</p>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-[72px] lg:py-9">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]"
            aria-label="QUBIT home"
          >
            {/* Full-colour lockup on the light surface; the night lockup on the dark one. */}
            <BrandLogo variant="color" className="h-7 w-auto dark:hidden" />
            <BrandLogo variant="night" className="hidden h-7 w-auto dark:block" />
          </Link>
          <ThemeToggle variant="surface" />
        </div>

        <main className="my-auto w-full max-w-[420px] self-center py-8">
          <div className="flex flex-col gap-4 rounded-[18px] border border-[var(--l-card-bd)] bg-[var(--l-card-bg)] p-7 shadow-[var(--l-card-sh)] [animation:rise_.4s_cubic-bezier(.22,1,.36,1)_both] sm:px-[30px]">
            {children}
          </div>
        </main>

        <footer className="flex flex-col gap-1 text-[12px] text-[var(--l-ink-3)] sm:flex-row sm:justify-between sm:gap-4">
          <span>{footer ?? "QUBIT"}</span>
          <span>Trouble signing in? Contact your administrator.</span>
        </footer>
      </div>
    </div>
  );
}

/* ── Form pieces shared by the pre-auth screens (labels above, placeholders inside, U2/U3) ── */

export const AUTH_INPUT_CLASS =
  "box-border h-10 w-full rounded-[10px] border border-[var(--l-field-bd)] bg-[var(--l-field-bg)] px-3 text-[14px] text-[var(--l-ink)] outline-none transition-colors placeholder:text-[var(--l-ph)] focus:border-[var(--login-brand)] focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_22%,transparent)]";

export function AuthField({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-semibold text-[var(--l-ink-2)]">
        {label}
      </label>
      {children}
      {hint && <p className="text-[12px] text-[var(--l-ink-3)]">{hint}</p>}
    </div>
  );
}

export function AuthHeading({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <div>
      <h1 className="text-[20px] font-bold tracking-[-.2px] text-[var(--l-ink)]">{title}</h1>
      {lead && <p className="mt-1 text-[14px] text-[var(--l-ink-3)]">{lead}</p>}
    </div>
  );
}

export const AUTH_PRIMARY_CLASS =
  "flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--login-brand)] px-4 text-[13.5px] font-bold text-[var(--onbrand)] outline-none transition-[filter] hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_35%,transparent)] disabled:opacity-60";

export const AUTH_SECONDARY_CLASS =
  "flex h-10 w-full items-center justify-center gap-2.5 rounded-[10px] border border-[var(--l-field-bd)] bg-[var(--l-card-bg)] px-4 text-[13.5px] font-semibold text-[var(--l-ink)] outline-none transition-colors hover:bg-[var(--l-chip-bg)] focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_35%,transparent)] disabled:opacity-60";

export const AUTH_LINK_CLASS =
  "rounded-sm text-[12.5px] font-semibold text-[var(--login-brand)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--login-brand)_55%,transparent)]";

export function OrgChip({ name }: { name: string }) {
  return (
    <span
      className="self-start rounded-full px-2 py-[3px] text-[11.5px] font-semibold text-[var(--login-brand)]"
      style={{ background: "color-mix(in oklab, var(--login-brand) 12%, transparent)" }}
    >
      {name}
    </span>
  );
}

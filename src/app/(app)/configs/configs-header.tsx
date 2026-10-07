"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Configs section header — eyebrow + title + chip tabs, mirroring AdminHeader. One tab for
// now (Integrations); add sections here as Configs grows. `action` is an optional trailing slot.
const TABS = [{ label: "Integrations", href: "/configs/integrations" }];

export function ConfigsHeader({ subtitle, action }: { subtitle?: string; action?: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex flex-col gap-3.5 [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1.5 font-mono rv:font-sans text-[10px] rv:text-overline font-semibold uppercase tracking-[2.4px] text-[var(--ink4)]">
            Configuration · gated on admin:access
          </div>
          <h1 className="font-heading text-[27px] rv:text-heading-lg font-bold tracking-[-.8px] text-[var(--qink)]">Configs</h1>
          {subtitle && <p className="mt-1 text-[12px] rv:text-body-sm text-[var(--ink4)]">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = path === t.href || path.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                borderColor: active ? "var(--brand)" : "var(--hair)",
                background: active ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
                color: active ? "var(--brand)" : "var(--ink3)",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Shared QUBIT App v3 admin header — eyebrow + Archivo title + chip tabs across the four
// admin routes (Users / Roles / Audit / Departments). `action` is an optional trailing slot
// (e.g. the New user / New department dialog trigger).
const TABS = [
  { label: "Users", href: "/admin/users" },
  { label: "Roles", href: "/admin/roles" },
  { label: "Audit", href: "/admin/audit" },
  { label: "Departments", href: "/admin/departments" },
];

export function AdminHeader({ subtitle, action }: { subtitle?: string; action?: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex flex-col gap-3.5 [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[2.4px] text-[var(--ink4)]">
            Administration · IAM v1 · gated on admin:access
          </div>
          <h1 className="font-heading text-[27px] font-bold tracking-[-.8px] text-[var(--qink)]">Admin</h1>
          {subtitle && <p className="mt-1 text-[12px] text-[var(--ink4)]">{subtitle}</p>}
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

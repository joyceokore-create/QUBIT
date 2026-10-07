"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Shared QUBIT App v3 admin header — eyebrow + Archivo title + chip tabs across the five
// admin routes (Users / Roles / Audit / Departments / Access requests). `action` is an
// optional trailing slot (e.g. the New user / New department dialog trigger).
// DM1.73 (T6): Teams moved here from the top-level nav (it is admin territory and its
// top-level pill dead-ended for Heads). Tabs gated on iam:manage are hidden from viewers
// without it, so no admin tab ever renders a Forbidden page.
const TABS = [
  { label: "Users", href: "/admin/users" },
  { label: "Teams", href: "/admin/teams" },
  { label: "Roles", href: "/admin/roles" },
  { label: "Departments", href: "/admin/departments" },
  { label: "Audit", href: "/admin/audit", iamOnly: true },
  { label: "Access requests", href: "/admin/access-requests", iamOnly: true },
];

export function AdminHeader({ subtitle, action, canManageIam = true }: { subtitle?: string; action?: React.ReactNode; canManageIam?: boolean }) {
  const path = usePathname();

  const [newCount, setNewCount] = useState(0);
  useEffect(() => {
    let active = true;
    fetch("/api/admin/access-requests/count")
      .then((r) => (r.ok ? r.json() : { new: 0 }))
      .then((d) => {
        if (active) setNewCount(d.new ?? 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-3.5 [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1.5 font-mono rv:font-sans text-[10px] rv:text-overline font-semibold uppercase tracking-[2.4px] text-[var(--ink4)]">
            Administration · IAM v1 · gated on admin:access
          </div>
          <h1 className="font-heading text-[27px] rv:text-heading-lg font-bold tracking-[-.8px] text-[var(--qink)]">Admin</h1>
          {subtitle && <p className="mt-1 text-[12px] rv:text-body-sm text-[var(--ink4)]">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TABS.filter((t) => canManageIam || !t.iamOnly).map((t) => {
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
              {t.href === "/admin/access-requests" && newCount > 0 && (
                <span className="ml-1.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold leading-[16px] text-[var(--onbrand)]">
                  {newCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { TabStrip } from "@/components/ui/tab-strip";
import { usePathname } from "next/navigation";

// Shared QUBIT App v3 admin header — eyebrow + Archivo title + U1 tabs across the five
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
  { label: "Markets", href: "/admin/organisation" },
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
      <TabStrip
        label="Admin sections"
        active={TABS.find((t) => path === t.href || path.startsWith(`${t.href}/`))?.href ?? ""}
        tabs={TABS.filter((t) => canManageIam || !t.iamOnly).map((t) => ({
          key: t.href,
          label: t.label,
          href: t.href,
          count: t.href === "/admin/access-requests" && newCount > 0 ? newCount : undefined,
        }))}
      />
    </div>
  );
}

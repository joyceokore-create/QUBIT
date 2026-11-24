"use client";

import { TabStrip } from "@/components/ui/tab-strip";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/list/page-header";

// Shared QUBIT App v3 admin header — eyebrow + Archivo title + U1 tabs across the five
// admin routes (Users / Roles / Audit / Departments / Access requests). `action` is an
// optional trailing slot (e.g. the New user / New department dialog trigger).
// DM1.73 (T6): Teams moved here from the top-level nav (it is admin territory and its
// top-level pill dead-ended for Heads). Tabs gated on iam:manage are hidden from viewers
// without it, so no admin tab ever renders a Forbidden page.
const TABS = [
  { label: "Users", href: "/admin/users" },
  { label: "Teams", href: "/admin/teams" },
  { label: "Roles & Permissions", href: "/admin/roles" },
  { label: "Departments", href: "/admin/departments" },
  { label: "Markets", href: "/admin/organisation" },
  { label: "Audit Log", href: "/admin/audit", iamOnly: true },
  { label: "Access Requests", href: "/admin/access-requests", iamOnly: true },
  // UX11 (Q3): tenant settings — the time zone. Super Admin only.
  { label: "Settings", href: "/admin/settings", iamOnly: true },
];

// UX fidelity D-F7: Super Admin reaches every admin page from the sidebar, so no section tabs
// are drawn for them. Heads and Head of QA reach Admin through one "Admin" item and keep the
// tabs, limited to the pages they can use (iam:manage pages are hidden). Pages that don't pass
// a title get their section's name as the title.
export function AdminHeader({
  subtitle,
  action,
  canManageIam = true,
  title,
  description,
}: {
  subtitle?: string;
  action?: React.ReactNode;
  canManageIam?: boolean;
  title?: string;
  description?: React.ReactNode;
}) {
  const path = usePathname();

  const section = TABS.find((t) => path === t.href || path.startsWith(`${t.href}/`));
  const showTabs = !canManageIam;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={showTabs ? "Admin" : undefined} title={title ?? section?.label ?? "Admin"} description={description ?? subtitle} actions={action} />
      {showTabs && (
        <TabStrip
          label="Admin sections"
          active={section?.href ?? ""}
          tabs={TABS.filter((t) => !t.iamOnly).map((t) => ({ key: t.href, label: t.label, href: t.href }))}
        />
      )}
    </div>
  );
}

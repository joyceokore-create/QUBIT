import Link from "next/link";
import { TAB_LINK, TAB_LINK_ACTIVE } from "@/lib/surface";

// Milestone B — the view's three tabs as URL-driven links (so ?week=, ?as= and ?tab=
// compose, and every panel stays a server component with its own reads). Same look as
// the workspace's underline tabs.
export function ReportTabs({
  tabs,
  active,
  hrefFor,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  hrefFor: (key: string) => string;
}) {
  return (
    <nav aria-label="Report views" className="border-b border-[var(--border)]">
      <ul className="flex gap-0 overflow-x-auto [scrollbar-width:thin]">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <Link href={hrefFor(t.key)} aria-current={on ? "page" : undefined} className={`inline-flex ${TAB_LINK} ${on ? TAB_LINK_ACTIVE : ""}`}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

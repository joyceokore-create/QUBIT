import Link from "next/link";
import { TAB, TAB_ACTIVE, TAB_ACTIVE_ON_CARD, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * URL-driven tabs in the U1 style (UX plan): separate blocks, the active one filled with a
 * 2px brand border under it only, no line across the whole width. Each tab is a link, so
 * the tab lives in the URL (Back, refresh and shared links keep the view, L2).
 * `onCard` switches the active fill to --surface-2 for strips inside a white card.
 */
export interface TabStripItem {
  key: string;
  label: string;
  href: string;
  count?: number;
}

export function TabStrip({
  tabs,
  active,
  label,
  onCard = false,
  className,
}: {
  tabs: TabStripItem[];
  active: string;
  /** Accessible name for the nav landmark, e.g. "Report views". */
  label: string;
  onCard?: boolean;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ul className={TABS_ROW}>
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <Link href={t.href} aria-current={on ? "page" : undefined} className={cn(TAB, on && (onCard ? TAB_ACTIVE_ON_CARD : TAB_ACTIVE))}>
                {t.label}
                {t.count !== undefined && <span className={TAB_COUNT}>{t.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

import { TabStrip } from "@/components/ui/tab-strip";

// Milestone B — the view's tabs as URL-driven links (so ?week=, ?as= and ?tab= compose, and
// every panel stays a server component with its own reads). UX2: the shared U1 tab strip.
export function ReportTabs({
  tabs,
  active,
  hrefFor,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  hrefFor: (key: string) => string;
}) {
  return <TabStrip label="Report views" active={active} tabs={tabs.map((t) => ({ ...t, href: hrefFor(t.key) }))} />;
}

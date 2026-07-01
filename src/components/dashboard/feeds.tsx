import { cn } from "@/lib/utils";
import type { EscalationItem, UpcomingMilestone } from "@/server/dashboard";

const DOT_COLOR: Record<string, string> = {
  red: "bg-status-red",
  amber: "bg-amber",
  green: "bg-status-green",
};

function FeedRow({ color, text, meta }: { color: string; text: string; meta: string }) {
  return (
    <div className="flex gap-[9px] border-b border-background py-[9px] last:border-b-0 last:pb-0">
      <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", DOT_COLOR[color])} />
      <div>
        <div className="text-xs leading-[1.4] text-foreground">{text}</div>
        <div className="mt-0.5 text-[10px] text-ink-3">{meta}</div>
      </div>
    </div>
  );
}

export function EscalationsFeed({ items }: { items: EscalationItem[] }) {
  return (
    <div className="rounded-[10px] border border-ink-4 bg-white p-4">
      <div className="mb-2.5 text-[13px] font-semibold text-foreground">🔴 Escalations &amp; Risks</div>
      {items.length === 0 ? (
        <p className="text-xs text-ink-3">No open risks or issues right now.</p>
      ) : (
        items.map((item) => <FeedRow key={item.id} color={item.color} text={item.title} meta={item.meta} />)
      )}
    </div>
  );
}

export function MilestonesFeed({ items }: { items: UpcomingMilestone[] }) {
  return (
    <div className="rounded-[10px] border border-ink-4 bg-white p-4">
      <div className="mb-2.5 text-[13px] font-semibold text-foreground">📅 Upcoming Milestones</div>
      {items.length === 0 ? (
        <p className="text-xs text-ink-3">No upcoming milestones scheduled.</p>
      ) : (
        items.map((item) => <FeedRow key={item.id} color={item.color} text={item.text} meta={item.meta} />)
      )}
    </div>
  );
}

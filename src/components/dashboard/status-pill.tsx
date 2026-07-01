import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  OnTrack: "On Track",
  AtRisk: "At Risk",
  Overdue: "Overdue",
  Planning: "Planning",
};

const STATUS_CLASSES: Record<string, string> = {
  OnTrack: "bg-status-green-bg text-status-green",
  AtRisk: "bg-amber-bg text-amber",
  Overdue: "bg-status-red-bg text-status-red",
  Planning: "bg-status-blue-bg text-status-blue",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-[0.4px] uppercase",
        STATUS_CLASSES[status] ?? "bg-background text-ink-3",
        className,
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

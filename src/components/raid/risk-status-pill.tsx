import { cn } from "@/lib/utils";

const STATUS_CLASSES: Record<string, string> = {
  Open: "bg-status-red-bg text-status-red",
  Monitoring: "bg-amber-bg text-amber",
  Mitigated: "bg-status-green-bg text-status-green",
  Closed: "bg-background text-ink-3",
};

// A risk closed via materialise is distinguished from one closed by resolution — the
// underlying status string is "Closed" either way (see src/server/risks.ts) so nav.ts's
// open-count filter keeps working; this pill is the only place the distinction is visible.
export function RiskStatusPill({ status, materialised }: { status: string; materialised: boolean }) {
  if (materialised) {
    return (
      <span className="inline-block rounded-[4px] bg-status-blue-bg px-2 py-0.5 text-[10px] font-semibold tracking-[0.4px] text-status-blue uppercase">
        Materialised
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-block rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-[0.4px] uppercase",
        STATUS_CLASSES[status] ?? "bg-background text-ink-3",
      )}
    >
      {status}
    </span>
  );
}

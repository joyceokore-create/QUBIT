import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[6px] bg-background p-[12px_14px]">
      <div className="mb-1 text-[9px] font-bold tracking-[0.7px] text-ink-3 uppercase">{label}</div>
      <div className={cn("text-[21px] font-bold tracking-[-0.8px] text-foreground", valueClassName)}>
        {value}
      </div>
    </div>
  );
}

export function statusTextClass(status: string): string {
  if (status === "Overdue") return "text-status-red";
  if (status === "AtRisk") return "text-amber";
  return "text-status-green";
}

export function statusBarClass(status: string): string {
  if (status === "Overdue") return "bg-status-red";
  if (status === "AtRisk") return "bg-amber";
  return "bg-status-green";
}

const MS_CHIP_LABEL: Record<string, string> = { done: "✓", active: "▶", late: "!", pending: "○" };
const MS_CHIP_CLASS: Record<string, string> = {
  done: "bg-status-green-bg border-[#86EFAC] text-status-green",
  active: "bg-amber-bg border-[#FCD34D] text-amber",
  late: "bg-status-red-bg border-[#FCA5A5] text-status-red",
  pending: "bg-white border-ink-4 text-ink-3",
};

export function MilestoneChip({ name, state }: { name: string; state: string }) {
  return (
    <span
      className={cn(
        "rounded-[3px] border px-[7px] py-0.5 text-[9px] font-semibold",
        MS_CHIP_CLASS[state] ?? MS_CHIP_CLASS.pending,
      )}
    >
      {MS_CHIP_LABEL[state] ?? "○"} {name}
    </span>
  );
}

const MBLK_LABEL: Record<string, string> = {
  done: "✓ Done",
  active: "▶ Active",
  late: "! Late",
  pending: "○ Pending",
};
const MBLK_CLASS: Record<string, string> = {
  done: "bg-status-green-bg text-status-green",
  active: "bg-amber-bg text-amber",
  late: "bg-status-red-bg text-status-red",
  pending: "bg-background text-ink-3",
};

export function MilestoneBlock({ state }: { state: string | null }) {
  if (!state) return <span className="block text-center text-[11px] text-ink-4">—</span>;
  return (
    <div
      className={cn(
        "rounded-[3px] px-[5px] py-[3px] text-center text-[9px] font-semibold whitespace-nowrap",
        MBLK_CLASS[state] ?? MBLK_CLASS.pending,
      )}
    >
      {MBLK_LABEL[state] ?? state}
    </div>
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

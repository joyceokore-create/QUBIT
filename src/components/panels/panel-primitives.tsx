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

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

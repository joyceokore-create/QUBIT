import type { ReactNode } from "react";

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-ink-4 bg-white p-10 text-center">
      <p className="text-sm text-ink-3">{message}</p>
      {action}
    </div>
  );
}

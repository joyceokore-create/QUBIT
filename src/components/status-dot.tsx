import { statusMeta } from "@/lib/project-view";

/**
 * Small semantic colour dot for a project status — mirrors the status pills / RAG
 * dots so status <Select> options read consistently across the app.
 */
export function StatusDot({ status, className }: { status: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 flex-none rounded-full align-middle ${className ?? ""}`}
      style={{ background: `var(${statusMeta(status).tok})` }}
    />
  );
}

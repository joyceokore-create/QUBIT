"use client";

import { Download } from "lucide-react";

/**
 * "Export CSV" (docs/16 §9, M9) — a plain anchor to /api/export (or any CSV endpoint):
 * the browser handles the download, the server decides the permission scope, and there
 * is deliberately no client-side data path that could drift from what the screen shows.
 */
export function ExportButton({ href, label = "Export CSV" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      download
      className="flex items-center gap-1.5 rounded-full border border-[var(--hair)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--ink3)] transition-colors hover:border-brand hover:text-brand"
    >
      <Download className="size-3.5" /> {label}
    </a>
  );
}

"use client";

import { Download } from "lucide-react";
import { SECONDARY } from "@/lib/surface";

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
      // UX5 (U3): the standard secondary button — same 36px control size as the header's
      // primary action, so header actions line up and never look like a filter pill.
      className={SECONDARY}
    >
      <Download className="size-4" aria-hidden /> {label}
    </a>
  );
}

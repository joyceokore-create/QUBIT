"use client";

import { useState } from "react";
import { Check, Copy, FileDown, Printer } from "lucide-react";
import { downloadFile, markdownToHtmlDoc, slugify } from "@/lib/report-export";

// Download / copy actions for a shared report snapshot (client-only; the page itself is a
// server component that already resolved the report under the tenant's RLS context).
export function ShareActions({ title, markdown, footer }: { title: string; markdown: string; footer: string }) {
  const [copied, setCopied] = useState(false);

  function onMd() {
    downloadFile(`${slugify(title)}.md`, `${markdown}\n\n---\n_${footer}_\n`, "text/markdown;charset=utf-8");
  }
  function onHtml() {
    downloadFile(`${slugify(title)}.html`, markdownToHtmlDoc(markdown, { title, footer }), "text/html;charset=utf-8");
  }
  async function onCopyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Btn onClick={onMd} icon={<FileDown className="size-3.5" />} label="Markdown" />
      {/* DM1.73 (T4): this downloads a print-ready HTML file — there is no server PDF
          (deferred with M9-B). Labelled for what it does, not what M9-B will do. */}
      <Btn onClick={onHtml} icon={<Printer className="size-3.5" />} label="HTML (print to PDF)" />
      <Btn onClick={onCopyLink} icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} label={copied ? "Link copied" : "Copy link"} />
    </div>
  );
}

function Btn({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-[var(--w09)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--ink3)] transition-colors hover:border-brand hover:text-brand"
    >
      {icon}
      {label}
    </button>
  );
}

"use client";

import { useState } from "react";
import { CheckCheck, X } from "lucide-react";

// One-time onboarding checklist per primary group (docs/17 §1.3, docs/23 §7). Shown only
// to users who completed the guided first-login (onboardedAt set) and haven't dismissed
// it; the server decides via `show`. Dismissal writes user.checklistDismissedAt — the
// column, not localStorage, so it holds across devices. Executives get none (§1.3:
// straight to value).

const ITEMS: Record<string, { text: string; href: string }[]> = {
  developer: [
    { text: "Confirm the tasks assigned to you", href: "/my-tasks" },
    { text: "Open your project board (dev lens)", href: "/projects" },
    { text: "Flag anything already stuck as blocked", href: "/my-tasks" },
  ],
  pm: [
    { text: "Confirm your team + allocations", href: "/people" },
    { text: "Review this week's check-in drafts", href: "/projects" },
    { text: "Clear pending approvals in your queue", href: "/my-tasks" },
  ],
  qa: [
    { text: "Review your test queue", href: "/my-tasks" },
    { text: "Triage unassigned bugs", href: "/projects" },
    { text: "Check aging items in QA", href: "/projects" },
  ],
  implementor: [
    { text: "Review upcoming go-lives", href: "/projects" },
    { text: "Check open rollout issues", href: "/risks" },
    { text: "Confirm handover docs are in the register", href: "/projects" },
  ],
};

export function FirstLoginChecklist({ group, show }: { group: string; show: boolean }) {
  const [visible, setVisible] = useState(show && !!ITEMS[group]);

  if (!visible) return null;
  const dismiss = () => {
    // Optimistic: hide now, persist in the background. Worst case (request lost) the
    // card reappears next visit — a nudge, not state anyone depends on mid-session.
    setVisible(false);
    void fetch("/api/me/checklist", { method: "POST" }).catch(() => {});
  };

  return (
    <div className="flex items-start gap-3 rounded-[12px] border border-[var(--brand)]/30 bg-[color-mix(in_oklab,var(--brand)_6%,transparent)] p-3.5">
      <CheckCheck className="mt-0.5 size-4 flex-none text-[var(--brand)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-bold text-[var(--qink)]">Welcome — three things to get set up</p>
        <ol className="mt-1 flex flex-col gap-0.5">
          {(ITEMS[group] ?? []).map((item, i) => (
            <li key={i} className="text-[12px] text-[var(--ink2)]">
              {i + 1}.{" "}
              <a href={item.href} className="underline decoration-[var(--brand)]/40 underline-offset-2 hover:text-[var(--brand)]">
                {item.text}
              </a>
            </li>
          ))}
        </ol>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss checklist" className="rounded p-1 text-[var(--ink4)] hover:text-[var(--qink)]">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

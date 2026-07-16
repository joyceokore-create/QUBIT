"use client";

import { toast } from "sonner";
import { QubitLogo } from "@/components/brand/qubit-logo";

interface QNudgeOptions {
  title: string;
  body: string;
  /** Optional primary action (brand button). The nudge auto-dismisses after it runs. */
  action?: { label: string; onClick: () => void };
  duration?: number;
}

/**
 * Q-branded proactive nudge (design_handoff screen 6). Rendered through the
 * existing sonner Toaster as a fully custom component so we control the exact
 * card: card2 surface, 3px brand left border, Q glyph tile, uppercase brand
 * title, body, and brand-primary + ghost-Dismiss actions.
 *
 * Phase 5 feeds this from the notification service; here it's the shared helper.
 */
export function qNudge({ title, body, action, duration = 6000 }: QNudgeOptions) {
  return toast.custom(
    (id) => (
      <div
        className="w-[360px] max-w-[calc(100vw-32px)] rounded-[14px] border border-[var(--w10)] border-l-[3px] border-l-[var(--brand)] bg-[var(--card2)] p-[15px] [animation:toastIn_.3s_ease]"
        style={{ boxShadow: "0 18px 50px var(--sh55)" }}
        role="status"
      >
        <div className="flex gap-3">
          <span className="grid size-[30px] flex-none place-items-center rounded-[9px] bg-[color-mix(in_oklab,var(--brand)_14%,transparent)]">
            <QubitLogo square={5} gap={1.5} radius={1.5} color="var(--brand)" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[.8px] text-brand">{title}</div>
            <div className="mt-1 text-[12.5px] leading-[1.5] text-[var(--ink2)]">{body}</div>
            <div className="mt-[11px] flex items-center gap-2">
              {action && (
                <button
                  type="button"
                  onClick={() => {
                    action.onClick();
                    toast.dismiss(id);
                  }}
                  className="rounded-full bg-[var(--brand)] px-[13px] py-[6px] text-[11.5px] font-bold text-[var(--onbrand)] transition-transform hover:-translate-y-px"
                >
                  {action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => toast.dismiss(id)}
                className="rounded-full px-[11px] py-[6px] text-[11.5px] font-semibold text-[var(--ink4)] transition-colors hover:text-[var(--qink)]"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    ),
    { duration },
  );
}

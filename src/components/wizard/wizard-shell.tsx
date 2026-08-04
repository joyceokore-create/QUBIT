"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WizardStep } from "@/lib/wizard";

/**
 * Shared creation-wizard chrome (docs/26 §5, M-P1b): left rail of numbered steps
 * (done ✓ / current / upcoming / conditionally-skipped greyed), one question card as
 * `children`, the standard error slot, and the Back / Continue / Create footer with
 * "Create another". State lives with the caller — this is chrome, like AdminFormDialog.
 */
export function WizardShell({
  steps,
  current,
  skipped,
  onStep,
  onBack,
  onNext,
  onCreate,
  onCreateAnother,
  createLabel,
  busy = false,
  error,
  children,
}: {
  steps: WizardStep[];
  current: number;
  /** Keys of steps the current choices make irrelevant (rendered greyed, not removable). */
  skipped?: Set<string>;
  onStep: (index: number) => void;
  onBack: () => void;
  onNext: () => void;
  onCreate: () => void | Promise<void>;
  onCreateAnother?: () => void;
  createLabel: string;
  busy?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  const skip = skipped ?? new Set<string>();
  const last = current === steps.length - 1;
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[190px_1fr]">
      <div className="flex flex-col gap-0.5 self-start md:sticky md:top-20">
        {steps.map((s, i) => {
          const isSkipped = skip.has(s.key);
          const state = isSkipped ? "skip" : i === current ? "on" : i < current ? "done" : "todo";
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => !isSkipped && onStep(i)}
              className={cn(
                "flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[12px] font-semibold transition-colors",
                state === "on" && "bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] text-[var(--brand)]",
                state === "done" && "text-[var(--ok)]",
                state === "todo" && "text-[var(--ink4)] hover:text-[var(--ink2)]",
                state === "skip" && "cursor-default text-[var(--ink5)] opacity-50",
              )}
            >
              <span
                className={cn(
                  "flex size-[18px] flex-none items-center justify-center rounded-full border text-[10px] font-bold",
                  state === "on" && "border-[var(--brand)] text-[var(--brand)]",
                  state === "done" && "border-[var(--ok)] bg-[color-mix(in_oklab,var(--ok)_12%,transparent)] text-[var(--ok)]",
                  (state === "todo" || state === "skip") && "border-[var(--w10)]",
                )}
              >
                {state === "done" ? <Check className="size-3" /> : i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
        <p className="mt-2.5 px-2.5 text-[10.5px] leading-relaxed text-[var(--ink4)]">
          ✎ Draft auto-saves at every step — leave and resume anytime.
        </p>
      </div>

      <div className="min-w-0">
        {children}
        {error && (
          <p role="alert" className="mt-3 text-[12.5px] text-status-red">
            {error}
          </p>
        )}
        <div className="mt-4 flex items-center gap-2.5">
          {current > 0 && (
            <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
              ← Back
            </Button>
          )}
          {!last ? (
            <Button type="button" onClick={onNext} disabled={busy}>
              Continue →
            </Button>
          ) : (
            <>
              <Button type="button" onClick={() => void onCreate()} disabled={busy}>
                {busy ? "Creating…" : createLabel}
              </Button>
              {onCreateAnother && (
                <Button type="button" variant="outline" onClick={onCreateAnother} disabled={busy}>
                  Create another
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The one-question card every step renders into. */
export function WizardCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-[var(--w08)] bg-[var(--qcard)] p-5">
      <p className="text-[13.5px] font-bold text-[var(--qink)]">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Selectable chip (markets, categories). */
export function Chip({
  on,
  onClick,
  children,
  disabled,
}: {
  on: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "mr-1.5 mb-1.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
        on
          ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_8%,transparent)] text-[var(--brand)]"
          : "border-[var(--w10)] text-[var(--ink3)] hover:text-[var(--qink)]",
        disabled && "cursor-default opacity-50",
      )}
    >
      {children}
    </button>
  );
}

/** Large either/or option card (lens, template). */
export function OptionCard({
  on,
  onClick,
  title,
  desc,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[12px] border-[1.5px] p-4 text-left transition-colors",
        on
          ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_6%,transparent)]"
          : "border-[var(--w08)] hover:border-[var(--w10)]",
      )}
    >
      <p className={cn("text-[13px] font-bold", on ? "text-[var(--brand)]" : "text-[var(--qink)]")}>
        {title} {on && "✓"}
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--ink3)]">{desc}</p>
      {children}
    </button>
  );
}

"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { FIELD_FOCUS, FOCUS } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * Design spec v2 drawer (docs/08 § Drawer). One right-hand panel, 440px (wide 580px), full
 * width on phones; scrim without blur; bordered 32px close (from SheetContent). Header 18×20
 * with an optional step line, title 17/700 and subtitle; body 16×20, gap 14, scrolls; footer
 * right-aligned 36px buttons with an optional note on the left. Focus trap, Esc, backdrop
 * click and focus return come from the Base UI dialog.
 */
export function Drawer({ open, onClose, wide = false, children }: { open: boolean; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className={cn("w-full gap-0 p-0 data-[side=right]:w-full", wide ? "data-[side=right]:sm:max-w-[var(--ds-drawer-w-wide)]" : "data-[side=right]:sm:max-w-[var(--ds-drawer-w)]")}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** The drawer's frame: header, scrolling body and footer, as a form when `onSubmit` is set. */
export function DrawerFrame({ header, footer, children, onSubmit }: { header: ReactNode; footer?: ReactNode; children: ReactNode; onSubmit?: (e: React.FormEvent) => void }) {
  const inner = (
    <>
      {header}
      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-4 pt-4">{children}</div>
      {footer}
    </>
  );
  return onSubmit ? (
    <form onSubmit={onSubmit} className="flex h-full flex-col">
      {inner}
    </form>
  ) : (
    <div className="flex h-full flex-col">{inner}</div>
  );
}

export function DrawerHeader({ step, title, subtitle, onBack, backLabel = "Back", brief = false, icon }: { step?: ReactNode; title: ReactNode; subtitle?: ReactNode; onBack?: () => void; backLabel?: string; brief?: boolean; icon?: ReactNode }) {
  return (
    <div className="border-b border-[var(--ds-line)] px-5 py-[18px] pr-16">
      {onBack && (
        <button type="button" onClick={onBack} className={cn("mb-1.5 inline-flex items-center gap-1 rounded-[4px] text-[12px] font-semibold text-[var(--ds-ink3)] hover:text-[var(--ds-ink)]", FOCUS)}>
          <ArrowLeft className="size-3.5" aria-hidden /> {backLabel}
        </button>
      )}
      {step && <div className="text-[11.5px] font-semibold text-[var(--ds-ink3)]">{step}</div>}
      <SheetTitle className={cn("mt-0.5 flex items-center gap-1.5 font-sans", brief ? "text-[16px] font-bold text-[var(--ds-brand-ink)]" : "text-[17px] font-bold text-[var(--ds-ink)]")}>
        {icon}
        {title}
      </SheetTitle>
      {subtitle ? <SheetDescription className="mt-0.5 text-[12px] text-[var(--ds-ink3)]">{subtitle}</SheetDescription> : <SheetDescription className="sr-only">{typeof title === "string" ? title : "Details"}</SheetDescription>}
    </div>
  );
}

export function DrawerFooter({ note, children }: { note?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-[var(--ds-line)] px-5 py-3">
      {note && <span className="mr-auto text-[12px] text-[var(--ds-ink3)]">{note}</span>}
      {children}
    </div>
  );
}

/** A titled section (`.dsec`): 11/700 uppercase label, gap 8. Labels written in Title Case. */
export function DrawerSection({ title, children, aside }: { title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[.07em] text-[var(--ds-ink3)]">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Key/value panel (`.kv`): two columns of stacked label (11.5 ink3) over value (13/600). */
export function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 rounded-[var(--ds-radius-kv)] bg-[var(--ds-surface2)] px-3.5 py-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[11.5px] text-[var(--ds-ink3)]">{k}</dt>
          <dd className="min-w-0 break-words text-[13px] font-semibold text-[var(--ds-ink)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A labelled field (`.f`): label 11.5/600 ink3 above the control, optional hint under it. */
export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  const Tag = htmlFor ? "div" : "label";
  return (
    <Tag className="flex flex-col gap-[5px]">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[11.5px] font-semibold text-[var(--ds-ink3)]">
          {label}
        </label>
      ) : (
        <span className="text-[11.5px] font-semibold text-[var(--ds-ink3)]">{label}</span>
      )}
      {children}
      {hint && <span className="text-[12px] text-[var(--ds-ink3)]">{hint}</span>}
    </Tag>
  );
}

/** Field control classes (`.fi`): 36px, line border, radius 10, 13px ink. */
export const FIELD_INPUT = `min-h-[var(--ds-control-h)] w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-line)] bg-[var(--ds-card)] px-[11px] text-[13px] text-[var(--ds-ink)] placeholder:text-[var(--ds-placeholder)] ${FIELD_FOCUS}`;
export const FIELD_TEXTAREA = `${FIELD_INPUT} min-h-16 py-[9px] leading-[1.5]`;

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** For `rag`: which solid fill the selected option takes. */
  tone?: "ok" | "warn" | "bad";
}

/** Separate-button choice (`.segs`); selected = ink fill. `rag` variant fills solid
 * green / amber / red with white text (labels: On track / At risk / Off track). */
export function Choice<T extends string>({ label, value, options, onChange, rag = false, disabled = false }: { label: string; value: T | null; options: ChoiceOption<T>[]; onChange?: (v: T) => void; rag?: boolean; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        const fill = on ? (rag && o.tone ? `var(--ds-${o.tone})` : "var(--ds-ink)") : undefined;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange?.(o.value)}
            className={cn(
              "rounded-[var(--ds-radius-control)] border px-3.5 py-[7px] text-[12.5px] font-semibold transition-colors disabled:cursor-default",
              on ? "text-white" : "border-[var(--ds-line)] bg-[var(--ds-card)] text-[var(--ds-ink2)] hover:bg-[var(--ds-surface2)] disabled:hover:bg-[var(--ds-card)]",
              on && !rag && "text-[var(--ds-card)]",
              FOCUS,
            )}
            style={on ? { background: fill, borderColor: fill } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Checklist (`.ck`): met items with a green check, unmet with an ink3 circle and text. */
export function Checklist({ items }: { items: { label: ReactNode; done: boolean }[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {items.map((it, i) => (
        <li key={i} className={cn("flex items-center gap-2 text-[13px]", it.done ? "text-[var(--ds-ink)]" : "text-[var(--ds-ink3)]")}>
          {it.done ? <Check className="size-4 flex-none text-[var(--ds-ok-text)]" aria-hidden /> : <Circle className="size-4 flex-none text-[var(--ds-ink3)]" aria-hidden />}
          <span>
            <span className="sr-only">{it.done ? "Done: " : "Not done: "}</span>
            {it.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Drawer body text (`.dp`) and hint. */
export function DrawerText({ children, hint = false }: { children: ReactNode; hint?: boolean }) {
  return <p className={hint ? "text-[12px] text-[var(--ds-ink3)]" : "text-[13px] leading-[1.55] text-[var(--ds-ink2)]"}>{children}</p>;
}

/** Error line inside a drawer. */
export function DrawerError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-[12.5px] font-semibold text-[var(--ds-bad-text)]">
      {children}
    </p>
  );
}

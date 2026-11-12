"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ListFilter, Search, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FIELD_FOCUS, FOCUS } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX5 (L1/L2) + design spec v2 (docs/08 § Toolbar): search on the left, then the page's
 * filters as chip dropdowns, then "Clear all" inline — one row, gap 10 (filters gap 6).
 * Actions live in the page header. A closed filter chip reads its dimension ("Severity ⌄");
 * an active one reads "Severity: Critical" in brand-wash with an × that clears it.
 */

const CHIP_BASE = "inline-flex h-[var(--ds-control-h)] items-center gap-[5px] rounded-[var(--ds-radius-control)] border text-[12.5px] font-semibold shadow-[var(--ds-shadow-control)]";
const CHIP_OFF = "border-transparent bg-[var(--ds-card)] text-[var(--ds-ink2)] hover:bg-[var(--ds-surface2)]";
const CHIP_ON = "border-transparent bg-[var(--ds-brand-wash)] text-[var(--ds-brand-ink)]";

export function ListToolbar({ children, label = "Search and filters" }: { children: ReactNode; label?: string }) {
  return (
    <div role="search" aria-label={label} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 [&>[data-filter]+[data-filter]]:-ml-1">
      {children}
    </div>
  );
}

/** Search field; the placeholder says what it searches. Debounced into the URL. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (q: string) => void;
  /** e.g. "Search projects or codes". */
  placeholder: string;
  /** Accessible name, e.g. "Search projects". */
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const last = useRef(value);

  // Follow the URL when it changes from elsewhere (Back, "Clear all").
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => {
    if (draft.trim() === last.current) return;
    const t = setTimeout(() => {
      last.current = draft.trim();
      onChange(draft.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [draft, onChange]);

  return (
    <div className={cn("relative w-full sm:w-[280px]", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ds-ink3)]" aria-hidden />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        maxLength={100}
        className={cn(
          "h-[var(--ds-control-h)] w-full rounded-[var(--ds-radius-control)] border border-transparent bg-[var(--ds-card)] pl-[30px] pr-3 text-[12.5px] shadow-[var(--ds-shadow-control)] text-[var(--ds-ink)] placeholder:text-[var(--ds-placeholder)]",
          FIELD_FOCUS,
        )}
      />
    </div>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

/** One filter as a chip dropdown. The empty value is "all" (`allLabel`, e.g. "All
 * severities", the first menu option). `label` is the dimension in Title Case ("Severity"). */
export function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  const current = options.find((o) => o.value === value);
  const on = !!value;
  return (
    <span data-filter className={cn(CHIP_BASE, on ? CHIP_ON : CHIP_OFF, "pr-0")}>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={on ? `${label}: ${current?.label ?? value}. Change filter` : `Filter by ${label}`}
          className={cn("inline-flex h-full max-w-[240px] items-center gap-[5px] rounded-[var(--ds-radius-control)] pl-3", on ? "pr-1" : "pr-3", FOCUS)}
        >
          {/* Designer, 12 Nov 2026: a filter icon on every filter chip so it reads as a filter. */}
          <ListFilter className="size-3.5 flex-none opacity-80" aria-hidden />
          <span className="truncate">{on ? `${label}: ${current?.label ?? value}` : label}</span>
          {!on && <ChevronDown className="size-[11px] flex-none" aria-hidden />}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[200px] rounded-[12px] bg-[var(--ds-card)] p-1.5 text-[var(--ds-ink)] shadow-[var(--ds-shadow-menu)] ring-1 ring-[var(--ds-line)]">
          <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(String(v ?? ""))}>
            {[{ value: "", label: allLabel }, ...options].map((o) => (
              <DropdownMenuRadioItem
                key={o.value || "__all"}
                value={o.value}
                className="rounded-[8px] px-[9px] py-[7px] pr-8 text-[12.5px]"
              >
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {on && (
        <button type="button" aria-label={`Clear ${label} filter`} onClick={() => onChange("")} className={cn("mr-1 grid size-6 place-items-center rounded-[6px] hover:bg-[color-mix(in_oklab,var(--ds-brand)_12%,transparent)]", FOCUS)}>
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
}

/** A plain on/off filter (e.g. "Mine"), a chip like the others; on = brand-wash. */
export function FilterToggle({ label, pressed, onChange, count }: { label: string; pressed: boolean; onChange: (on: boolean) => void; count?: number }) {
  return (
    <button type="button" data-filter aria-pressed={pressed} onClick={() => onChange(!pressed)} className={cn(CHIP_BASE, pressed ? CHIP_ON : CHIP_OFF, "px-3", FOCUS)}>
      {pressed ? <Check className="size-3.5 flex-none" aria-hidden /> : <ListFilter className="size-3.5 flex-none opacity-80" aria-hidden />}
      {label}
      {count !== undefined && <span className="text-[11px] font-bold tabular-nums opacity-80">{count}</span>}
    </button>
  );
}

export interface ActiveFilter {
  key: string;
  /** e.g. "Severity: Critical". */
  label: string;
}

/** "Clear all", inline at the end of the toolbar row — shown when more than one filter is on.
 * (Each active filter chip clears itself with its ×.) Place it inside `ListToolbar`. */
export function FilterChips({ filters, onClearAll }: { filters: ActiveFilter[]; onRemove?: (key: string) => void; onClearAll: () => void }) {
  if (filters.length < 2) return null;
  return (
    <button
      type="button"
      onClick={onClearAll}
      aria-label={`Clear all ${filters.length} filters`}
      className={cn("mr-1 rounded-[4px] text-[12px] font-semibold text-[var(--ds-brand-ink)] underline-offset-2 hover:underline", FOCUS)}
    >
      Clear All
    </button>
  );
}

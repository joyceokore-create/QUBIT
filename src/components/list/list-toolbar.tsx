"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { FOCUS } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX5 (L1/L2, U3) — the list toolbar: search on the left, the page's common filters next to
 * it, nothing else (actions live in the page header). Every control is the 36px control size
 * with the input radius; filters are not pills. Active filters show below as removable chips,
 * with "Clear all" last.
 */

const CONTROL = `h-[var(--control-h)] rounded-[var(--control-r)] border border-[var(--input)] bg-[var(--qcard)] text-[13px] text-[var(--qink)] ${FOCUS}`;

export function ListToolbar({ children, label = "Search and filters" }: { children: ReactNode; label?: string }) {
  return (
    <div role="search" aria-label={label} className="flex flex-wrap items-center gap-2">
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
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink3)]" aria-hidden />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        maxLength={100}
        className={cn(CONTROL, "w-full pl-9 pr-3 placeholder:text-[var(--ink3)]")}
      />
    </div>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

/** One filter. The empty value is "all" and reads e.g. "All severities". */
export function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  /** Accessible name, e.g. "Severity". */
  label: string;
  allLabel: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(CONTROL, "max-w-[220px] px-3 pr-8", value && "border-[color-mix(in_oklab,var(--brand)_45%,var(--input))] font-semibold")}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A plain on/off filter (e.g. "Mine"), same size as the other controls. */
export function FilterToggle({ label, pressed, onChange, count }: { label: string; pressed: boolean; onChange: (on: boolean) => void; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cn(
        CONTROL,
        "inline-flex items-center gap-1.5 px-3 font-semibold",
        pressed ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_8%,var(--qcard))] text-[var(--qink)]" : "text-[var(--ink2)]",
      )}
    >
      {label}
      {count !== undefined && <span className="text-[11px] font-bold tabular-nums text-[var(--ink3)]">{count}</span>}
    </button>
  );
}

export interface ActiveFilter {
  key: string;
  /** e.g. "Severity: Critical". */
  label: string;
}

/** Removable chips for the active filters; "Clear all" sits last when more than one is on. */
export function FilterChips({ filters, onRemove, onClearAll }: { filters: ActiveFilter[]; onRemove: (key: string) => void; onClearAll: () => void }) {
  if (!filters.length) return null;
  return (
    <ul aria-label="Active filters" className="flex flex-wrap items-center gap-1.5">
      {filters.map((f) => (
        <li key={f.key}>
          <button
            type="button"
            onClick={() => onRemove(f.key)}
            aria-label={`Remove filter ${f.label}`}
            className={`inline-flex h-7 items-center gap-1 rounded-[var(--control-r)] bg-[var(--surface-2)] pl-2.5 pr-1.5 text-[12px] font-semibold text-[var(--ink2)] hover:text-[var(--qink)] ${FOCUS}`}
          >
            {f.label}
            <X className="size-3.5" aria-hidden />
          </button>
        </li>
      ))}
      {filters.length > 1 && (
        <li>
          <button type="button" onClick={onClearAll} className={`h-7 rounded-[6px] px-1.5 text-[12px] font-semibold text-[var(--ink3)] underline-offset-2 hover:text-[var(--qink)] hover:underline ${FOCUS}`}>
            Clear all
          </button>
        </li>
      )}
    </ul>
  );
}

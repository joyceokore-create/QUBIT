// Shared surface + RAG presentation tokens (docs/08-design-system.md). These strings were
// copy-pasted into ~20 files as local `CARD` consts and 10 identical `RAG_TOKEN` maps, so
// a token change meant a 20-file sweep and drift was only a matter of time. One home now.
// Pure strings/maps — safe in server and client components alike.
import type { Rag } from "@/server/health";

/** The standard card surface (design spec v2, docs/08): radius 18, the --ds-bd hairline and
 * the soft two-layer --ds-shadow. Pair with `CARD_BG` for the fill. */
export const CARD = "rounded-[var(--ds-radius-card)] border border-[var(--ds-bd)] shadow-[var(--ds-shadow)]";

/** Legacy alias kept for the classic dashboard's floating panels (no glass in spec v2). */
export const CARD_GLASS = CARD;

/** Inline background for a card — `style={CARD_BG}` (a var, so themes still drive it). */
export const CARD_BG = { background: "var(--ds-card)" } as const;

/** RAG → CSS custom-property name. The one mapping; everything else derives from it. */
export const RAG_TOKEN: Record<string, string> = { Green: "--ok", Amber: "--warn", Red: "--bad" };

/** The token for any RAG-ish string, with a neutral fallback for unknown values. */
export function ragToken(rag: string | null | undefined): string {
  return (rag && RAG_TOKEN[rag]) || "--ink4";
}

/** Chip styling for a RAG value: coloured text on a 10% wash of the same token. */
export function ragChipStyle(rag: string | null | undefined): { color: string; background: string } {
  const tok = ragToken(rag);
  return { color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 10%, transparent)` };
}

/** Solid dot/bar fill for a RAG value. */
export function ragFill(rag: string | null | undefined): { background: string } {
  return { background: `var(${ragToken(rag)})` };
}

/** Type-safe variant for callers that already hold a `Rag`. */
export function ragTokenOf(rag: Rag): string {
  return RAG_TOKEN[rag] ?? "--ink4";
}

/** The one keyboard-focus treatment for controls on a card: brand ring, offset off the
 * card surface. Append to any button/link/input className. */
export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-card)]";

/** Focus for TEXT FIELDS (inputs, textareas, selects): no offset ring — the field's own border
 * turns ink (black in light mode) and 2px thick (1px border + 1px ring), so an active field
 * never reads as an error. Designer, 12 Nov 2026. Buttons keep FOCUS. */
export const FIELD_FOCUS =
  "outline-none focus:border-[var(--ds-ink)] focus:ring-1 focus:ring-[var(--ds-ink)] focus:ring-offset-0";

/** Invalid text field (docs/08 § Errors): keyed on `aria-invalid="true"`, so a form only sets the
 * attribute. Red 1px border at rest; red 2px (border + ring) while focused — replaces the ink
 * focus border while the field is wrong. Pair with FIELD_FOCUS. */
export const FIELD_INVALID =
  "aria-invalid:border-[var(--ds-bad)] aria-invalid:focus:border-[var(--ds-bad)] aria-invalid:focus:ring-[var(--ds-bad)]";

/** Invalid GROUP of controls (checkbox list, chip picker, drop zone) — keyed on `data-invalid`
 * (from `useFieldErrors().bindGroup`): a 1px red outline just outside the group, no focus ring
 * when focus is moved to it. */
export const GROUP_INVALID =
  "outline-none data-[invalid]:rounded-[10px] data-[invalid]:outline data-[invalid]:outline-1 data-[invalid]:outline-offset-2 data-[invalid]:outline-[var(--ds-bad)]";

// ── Buttons, tabs, inputs and table headers — design spec v2 (docs/08 § Components).
// Controls are 36px with a 10px radius; compact (in-row) controls 28px / 8px. The primary
// keeps the brand fill in both themes (deviation 4) and darkens on hover, never lightens.
const PRIMARY_FILL = "bg-[var(--ds-brand)] text-[var(--ds-on-brand)] hover:bg-[color-mix(in_oklab,var(--ds-brand)_86%,black)]";
export const PRIMARY = `inline-flex h-[var(--ds-control-h)] items-center justify-center gap-1 whitespace-nowrap rounded-[var(--ds-radius-control)] px-3.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${PRIMARY_FILL} ${FOCUS}`;
/** Ink-filled button (light mode near-black; dark mode inverts). The top bar's "+ New", kept
 * apart from the brand-red primaries on the page (designer, 12 Nov 2026). */
export const INK_BUTTON = `inline-flex h-[var(--ds-control-h)] items-center justify-center gap-1 whitespace-nowrap rounded-[var(--ds-radius-control)] bg-[var(--ds-ink)] px-3.5 text-[12.5px] font-semibold text-[var(--ds-card)] transition-colors hover:bg-[color-mix(in_oklab,var(--ds-ink)_82%,var(--ds-card))] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const SECONDARY = `inline-flex h-[var(--ds-control-h)] items-center justify-center gap-1 whitespace-nowrap rounded-[var(--ds-radius-control)] border border-[var(--ds-line)] bg-[var(--ds-card)] px-3.5 shadow-[var(--ds-shadow-control)] text-[12.5px] font-semibold text-[var(--ds-ink)] transition-colors hover:bg-[var(--ds-surface2)] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const QUIET = `rounded-[6px] px-1.5 py-1 text-[12.5px] font-semibold text-[var(--ds-ink3)] transition-colors hover:text-[var(--ds-brand-ink)] ${FOCUS}`;

/**
 * U1 tabs: no full-width line under the strip. Each tab is its own block with rounded top
 * corners; the active one gets a fill and a 2px brand border under THAT tab only. The fill
 * is the card colour when the strip sits on the grey page, and --ds-surface2 inside a card
 * (`TAB_ACTIVE_ON_CARD`). The active tab's count turns brand-wash / brand-ink.
 */
export const TABS_ROW = "flex flex-wrap items-end gap-1";
export const TAB = `relative inline-flex h-[var(--ds-control-h)] flex-none items-center gap-1.5 whitespace-nowrap rounded-t-[var(--ds-radius-control)] border-b-2 border-transparent px-3.5 text-[12.5px] font-semibold text-[var(--ds-ink3)] transition-colors hover:text-[var(--ds-ink)] ${FOCUS}`;
const TAB_COUNT_ON = "[&_.tab-count]:bg-[var(--ds-brand-wash)] [&_.tab-count]:text-[var(--ds-brand-ink)]";
export const TAB_ACTIVE = `border-[var(--ds-brand)] bg-[var(--ds-card)] text-[var(--ds-ink)] ${TAB_COUNT_ON}`;
export const TAB_ACTIVE_ON_CARD = `border-[var(--ds-brand)] bg-[var(--ds-surface2)] text-[var(--ds-ink)] ${TAB_COUNT_ON}`;
/** The count after a tab label ("Waiting 3"); turns brand-wash inside an active tab. */
export const TAB_COUNT = "tab-count inline-flex min-w-[20px] items-center justify-center rounded-full bg-[var(--ds-mutedw)] px-1.5 text-[10.5px] font-bold leading-[17px] tabular-nums text-[var(--ds-ink2)]";

/** U3 — the compact 28px button, ONLY for actions inside table rows and list items. */
export const COMPACT = `inline-flex h-[var(--ds-control-h-compact)] items-center justify-center gap-1 whitespace-nowrap rounded-[var(--ds-radius-compact)] border border-[var(--ds-line)] bg-[var(--ds-card)] px-[11px] text-[12px] font-semibold text-[var(--ds-ink)] transition-colors hover:bg-[var(--ds-surface2)] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
/** The compact primary (an in-row "Confirm & Send"). */
export const COMPACT_PRIMARY = `inline-flex h-[var(--ds-control-h-compact)] items-center justify-center gap-1 whitespace-nowrap rounded-[var(--ds-radius-compact)] px-[11px] text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${PRIMARY_FILL} ${FOCUS}`;
/** U3 — a text input / select at the control size and radius. */
export const INPUT = `h-[var(--ds-control-h)] rounded-[var(--ds-radius-control)] border border-[var(--ds-line)] bg-[var(--ds-card)] px-3 text-[13px] text-[var(--ds-ink)] placeholder:text-[var(--ds-placeholder)] ${FIELD_FOCUS} ${FIELD_INVALID}`;
/** Table header row (put on <thead>): its own grey band (`--ds-thead`, a step darker than the
 * row hover so the two never look alike), rounded ends, 12.5px/600 ink2 Title Case labels —
 * not uppercase. Designer, 12 Nov 2026: larger and roomier than the design's 11px `.sgt`. */
export const THEAD =
  "[&_th]:bg-[var(--ds-thead)] [&_th]:px-3.5 [&_th]:py-[11px] [&_th]:text-left [&_th]:text-[12.5px] [&_th]:font-semibold [&_th]:text-[var(--ds-ink2)] [&_th:first-child]:rounded-l-[10px] [&_th:last-child]:rounded-r-[10px]";
/** Body rows of a spec table: 14px cells at 13px text, dotted rules, none after the last row.
 * Hover (where a table adds it) uses --ds-surface2, lighter than the header band. */
export const TROW = "[&>td]:border-b [&>td]:border-dotted [&>td]:border-[var(--ds-line)] [&>td]:px-3.5 [&>td]:py-3.5 [&>td]:text-[13px] [&>td]:align-middle last:[&>td]:border-b-0";

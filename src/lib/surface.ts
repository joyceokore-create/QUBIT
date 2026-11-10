// Shared surface + RAG presentation tokens (docs/08-design-system.md). These strings were
// copy-pasted into ~20 files as local `CARD` consts and 10 identical `RAG_TOKEN` maps, so
// a token change meant a 20-file sweep and drift was only a matter of time. One home now.
// Pure strings/maps — safe in server and client components alike.
import type { Rag } from "@/server/health";

/** The standard card surface. Pair with `CARD_BG` for the filled variant. */
export const CARD = "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)]";

/** The glass variant used by the dashboard's floating panels. */
export const CARD_GLASS = `${CARD} backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]`;

/** Inline background for a card — `style={CARD_BG}` (a var, so themes still drive it). */
export const CARD_BG = { background: "var(--cardbg)" } as const;

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
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cardbg)]";

// ── The three button voices and the tab look (UX plan U1/U3), shared by the workspace
// status card, the /reports views, admin and every new surface. One source so the
// vocabulary can't drift. Buttons use the control tokens: 36px tall, 10px radius.
export const PRIMARY = `inline-flex h-[var(--control-h)] items-center justify-center gap-2 rounded-[var(--control-r)] bg-[var(--brand)] px-4 text-[13px] font-bold text-[var(--onbrand)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const SECONDARY = `inline-flex h-[var(--control-h)] items-center justify-center gap-2 rounded-[var(--control-r)] border border-[var(--input)] bg-background px-3.5 text-[13px] font-semibold text-[var(--ink2)] transition-colors hover:text-[var(--qink)] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const QUIET = `rounded-[6px] px-1.5 py-1 text-[12.5px] font-semibold text-[var(--ink3)] transition-colors hover:text-brand ${FOCUS}`;

/**
 * U1 tabs: no full-width line under the strip. Each tab is its own block with rounded top
 * corners; the active one gets a fill and a 2px brand border under THAT tab only. The fill
 * is the card colour when the strip sits on the grey page, and --surface-2 when it sits
 * inside a white card (`TAB_ACTIVE_ON_CARD`). Inactive tabs are plain text.
 */
export const TABS_ROW = "flex flex-wrap items-end gap-1";
export const TAB = `relative inline-flex h-[var(--control-h)] flex-none items-center gap-2 whitespace-nowrap rounded-t-[var(--control-r)] border-b-2 border-transparent px-3.5 text-[13px] font-semibold text-[var(--ink3)] transition-colors hover:text-[var(--qink)] ${FOCUS}`;
export const TAB_ACTIVE = "border-[var(--brand)] bg-[var(--qcard)] text-[var(--qink)]";
export const TAB_ACTIVE_ON_CARD = "border-[var(--brand)] bg-[var(--surface-2)] text-[var(--qink)]";
/** The count after a tab label ("Waiting 3"). */
export const TAB_COUNT = "inline-flex min-w-[20px] items-center justify-center rounded-full bg-[var(--surface-2)] px-1.5 text-[11px] font-bold tabular-nums text-[var(--ink3)]";

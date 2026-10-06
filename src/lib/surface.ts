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

// ── Milestone A/B: the three button voices and the tab-link look, shared by the
// workspace status card and the /reports views. One source so the vocabulary can't drift.
export const PRIMARY = `inline-flex items-center gap-2 rounded-[8px] bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-[var(--onbrand)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const SECONDARY = `inline-flex items-center rounded-[8px] border border-[var(--input)] bg-background px-3.5 py-2 text-[13px] font-semibold text-[var(--ink2)] transition-colors hover:text-[var(--qink)] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const QUIET = `rounded-[6px] px-1.5 py-1 text-[12.5px] font-semibold text-[var(--ink3)] transition-colors hover:text-brand ${FOCUS}`;
/** An underline tab rendered as a link (URL-driven tabs): idle, plus the active overlay. */
export const TAB_LINK = `relative flex-none whitespace-nowrap rounded-[4px] px-2.5 py-2 text-[13px] font-semibold text-[var(--ink3)] transition-colors hover:text-[var(--qink)] ${FOCUS}`;
export const TAB_LINK_ACTIVE = "text-[var(--qink)] after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-[var(--brand)]";
